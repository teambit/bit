//! Publish prepared workspace files and bitmap history after the object import commits.
use super::{History, Prepared, existing, invalid, safe_destination};
use std::{
    collections::HashSet,
    fs::{self, OpenOptions},
    io::{self, Write},
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

impl Prepared {
    pub(in super::super) fn commit(self) -> io::Result<()> {
        self.check_bitmap("before publication")?;
        self.history.check(&self.root)?;
        for directory in &self.changes.empty_directories {
            if !fs::symlink_metadata(directory)?.is_dir()
                || fs::read_dir(directory)?.next().is_some()
            {
                return Err(invalid("inbound workspace destination changed"));
            }
        }
        for (path, _) in &self.changes.additions {
            safe_destination(&self.root, path)?;
        }
        for replacement in &self.changes.replacements {
            existing::check(&self.root, &replacement.path, &replacement.before)?;
        }
        let created_dirs = self.missing_directories()?;
        let mut written = Vec::new();
        let mut replaced = Vec::new();
        let mut history_published = false;
        let result = (|| {
            self.publish_files(&mut written)?;
            self.publish_replacements(&mut replaced)?;
            self.check_bitmap("during publication")?;
            self.history.publish(&self.root, &self.bitmap_before)?;
            history_published = true;
            self.publish_bitmap()
        })();
        if result.is_err() {
            if history_published {
                self.history.rollback();
            }
            self.rollback_replacements(replaced);
            rollback_files(written, created_dirs);
        }
        result
    }

    fn check_bitmap(&self, stage: &str) -> io::Result<()> {
        if fs::read(self.root.join(".bitmap"))? != self.bitmap_before {
            return Err(invalid(&format!("inbound bitmap changed {stage}")));
        }
        Ok(())
    }

    fn missing_directories(&self) -> io::Result<HashSet<PathBuf>> {
        let mut dirs = HashSet::new();
        for (path, _) in &self.changes.additions {
            let mut parent = path.parent().ok_or_else(|| invalid("inbound destination parent"))?;
            while parent != self.root && !parent.exists() {
                dirs.insert(parent.to_owned());
                parent = parent.parent().ok_or_else(|| invalid("inbound destination ancestor"))?;
            }
        }
        Ok(dirs)
    }

    fn publish_files(&self, written: &mut Vec<PathBuf>) -> io::Result<()> {
        for (path, body) in &self.changes.additions {
            safe_destination(&self.root, path)?;
            fs::create_dir_all(
                path.parent().ok_or_else(|| invalid("inbound destination parent"))?,
            )?;
            let mut file = OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(path)?;
            written.push(path.clone());
            file.write_all(body)?;
        }
        Ok(())
    }

    fn publish_replacements(&self, replaced: &mut Vec<usize>) -> io::Result<()> {
        for (index, replacement) in self.changes.replacements.iter().enumerate() {
            existing::check(&self.root, &replacement.path, &replacement.before)?;
            replaced.push(index);
            fs::write(&replacement.path, &replacement.after)?;
        }
        Ok(())
    }

    fn rollback_replacements(&self, replaced: Vec<usize>) {
        for index in replaced.into_iter().rev() {
            let replacement = &self.changes.replacements[index];
            let _ = fs::write(&replacement.path, &replacement.before);
        }
    }

    fn publish_bitmap(&self) -> io::Result<()> {
        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_err(io::Error::other)?
            .as_nanos();
        let temp = self.root.join(format!(".bitmap.rust-inbound-{}-{stamp}", std::process::id()));
        let mut file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temp)?;
        let publish = file.write_all(&self.bitmap_after).and_then(|()| file.sync_all());
        drop(file);
        let publish = publish.and_then(|()| fs::rename(&temp, self.root.join(".bitmap")));
        if publish.is_err() {
            let _ = fs::remove_file(&temp);
        }
        publish
    }
}

fn rollback_files(written: Vec<PathBuf>, created_dirs: HashSet<PathBuf>) {
    for path in written.into_iter().rev() {
        let _ = fs::remove_file(path);
    }
    let mut directories = created_dirs.into_iter().collect::<Vec<_>>();
    directories.sort_by_key(|path| std::cmp::Reverse(path.components().count()));
    for path in directories {
        let _ = fs::remove_dir(path);
    }
}

impl History {
    fn check(&self, root: &Path) -> io::Result<()> {
        safe_destination(root, &self.backup)?;
        let current = match fs::read(&self.metadata) {
            Ok(bytes) => Some(bytes),
            Err(error) if error.kind() == io::ErrorKind::NotFound => None,
            Err(error) => return Err(error),
        };
        if current != self.metadata_before
            || current.is_some() && !fs::symlink_metadata(&self.metadata)?.is_file()
        {
            return Err(invalid("inbound bitmap history changed"));
        }
        Ok(())
    }
    fn publish(&self, root: &Path, original: &[u8]) -> io::Result<()> {
        self.check(root)?;
        fs::create_dir_all(
            self.backup.parent().ok_or_else(|| invalid("inbound history directory"))?,
        )?;
        let result = (|| {
            let mut backup = OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(&self.backup)?;
            backup.write_all(original)?;
            let mut metadata = OpenOptions::new()
                .append(true)
                .create(true)
                .open(&self.metadata)?;
            writeln!(metadata, "{} import", self.file_id)?;
            metadata.sync_all()
        })();
        if result.is_err() {
            self.rollback();
        }
        result
    }
    fn rollback(&self) {
        let _ = fs::remove_file(&self.backup);
        match &self.metadata_before {
            Some(bytes) => {
                let _ = fs::write(&self.metadata, bytes);
            }
            None => {
                let _ = fs::remove_file(&self.metadata);
            }
        }
        if let Some(directory) = self.backup.parent() {
            let _ = fs::remove_dir(directory);
        }
    }
}
