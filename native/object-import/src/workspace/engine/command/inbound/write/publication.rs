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
    pub(in super::super) fn commit(&self) -> io::Result<()> {
        self.validate_policy()?;
        self.check_bitmap("before publication")?;
        self.history.check(&self.root)?;
        for directory in &self.changes.empty_directories {
            let metadata = fs::symlink_metadata(directory)?;
            if !metadata.is_dir()
                || metadata.file_type().is_symlink()
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
            self.publish_history_and_bitmap(&mut history_published)
        })();
        if result.is_err() {
            if history_published {
                self.history.rollback();
            }
            self.rollback_replacements(replaced);
            rollback_files(written, created_dirs);
        }
        result?;
        if let Some(policy) = &self.policy {
            policy.commit()?;
        }
        Ok(())
    }

    fn publish_history_and_bitmap(&self, history_published: &mut bool) -> io::Result<()> {
        self.check_bitmap("during publication")?;
        self.history.publish(&self.root, &self.bitmap_before)?;
        *history_published = true;
        if self.history.post_write_backup {
            self.history.publish_after_write(&self.bitmap_before, &self.bitmap_after)?;
        }
        self.publish_bitmap()
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
            if let Some(replacement) = self.changes.replacements.get(index) {
                let _ = fs::write(&replacement.path, &replacement.before);
            }
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
    pub(super) fn check(&self, root: &Path) -> io::Result<()> {
        self.attributes.validate(root, &self.backup)?;
        match &self.backup_before {
            Some(before) => {
                crate::merge_state::write::validate_existing(&self.backup)?;
                existing::check(root, &self.backup, before)?;
            }
            None => safe_destination(root, &self.backup)?,
        }
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
    pub(super) fn publish(&self, root: &Path, original: &[u8]) -> io::Result<()> {
        self.check(root)?;
        fs::create_dir_all(
            self.backup.parent().ok_or_else(|| invalid("inbound history directory"))?,
        )?;
        let result = (|| {
            crate::merge_state::write::commit_metadata(
                &self.backup,
                std::str::from_utf8(original).map_err(io::Error::other)?,
                self.attributes.source.as_ref(),
                false,
            )?;
            self.append_metadata()
        })();
        if result.is_err() {
            self.rollback();
        }
        result
    }
    pub(super) fn publish_after_write(&self, original: &[u8], after: &[u8]) -> io::Result<()> {
        if fs::read(&self.backup)? != original || fs::read(&self.metadata)? != self.first_metadata()
        {
            return Err(invalid("inbound bitmap history changed after first write"));
        }
        crate::merge_state::write::commit_metadata(
            &self.backup,
            std::str::from_utf8(after).map_err(io::Error::other)?,
            self.attributes.source.as_ref(),
            false,
        )?;
        self.append_metadata()
    }
    fn first_metadata(&self) -> Vec<u8> {
        let mut expected = self.metadata_before.clone().unwrap_or_default();
        expected.extend_from_slice(format!("{} import\n", self.file_id.trim()).as_bytes());
        expected
    }
    fn append_metadata(&self) -> io::Result<()> {
        let mut metadata = OpenOptions::new()
            .append(true)
            .create(true)
            .open(&self.metadata)?;
        writeln!(metadata, "{} import", self.file_id.trim())?;
        metadata.sync_all()
    }
    pub(super) fn rollback(&self) {
        match &self.backup_before {
            Some(bytes) => {
                if let Ok(contents) = std::str::from_utf8(bytes) {
                    let _ = crate::merge_state::write::commit_metadata(
                        &self.backup,
                        contents,
                        self.attributes.backup.as_ref(),
                        true,
                    );
                }
            }
            None => {
                let _ = fs::remove_file(&self.backup);
            }
        }
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
