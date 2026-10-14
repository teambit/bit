//! Retained workspace writes for a new, explicitly selected component. Every
//! Source and destination is checked during Prepare; publication happens after
//! the object transaction succeeds.
use super::{Target, config, invalid};
use crate::command_import::PreparedImport;
use serde_json::{Map, Value, json};
use std::{
    collections::HashSet,
    fs::{self, OpenOptions},
    io::{self, Write},
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

pub(super) struct Prepared {
    root: PathBuf,
    bitmap_before: Vec<u8>,
    bitmap_after: Vec<u8>,
    files: Vec<(PathBuf, Vec<u8>)>,
    history: History,
}
struct History {
    backup: PathBuf,
    metadata: PathBuf,
    metadata_before: Option<Vec<u8>>,
    file_id: String,
}

pub(super) fn prepare(
    root: &Path,
    targets: &[Target],
    import: &PreparedImport,
    file_id: Option<&str>,
) -> io::Result<Prepared> {
    let history = prepare_history(root, file_id)?;
    let settings = config::configuration(root)?;
    let template = settings["defaultDirectory"]
        .as_str()
        .ok_or_else(|| invalid("inbound workspace default directory"))?;
    let bitmap_before = fs::read(root.join(".bitmap"))?;
    let mut bitmap = crate::recovery::jsonc::parse(&bitmap_before)?;
    let rows = bitmap.as_object_mut().ok_or_else(|| invalid("inbound bitmap object"))?;
    let schema = bitmap_schema(rows)?;
    let mut files = Vec::new();
    let mut directories = HashSet::new();
    for target in targets {
        files.extend(prepare_target(root, template, target, import, rows, &mut directories)?);
    }
    rows.insert("$schema-version".into(), schema);
    if files
        .iter()
        .map(|(_, bytes)| bytes.len())
        .sum::<usize>()
        > 32 * 1024 * 1024
    {
        return Err(invalid("inbound workspace materialization bytes"));
    }
    let bitmap_after = crate::inspection::render_bitmap(&bitmap)?;
    Ok(Prepared { root: root.to_owned(), bitmap_before, bitmap_after, files, history })
}

fn prepare_history(root: &Path, file_id: Option<&str>) -> io::Result<History> {
    let file_id = file_id.ok_or_else(|| invalid("inbound bitmap history id"))?;
    super::super::bitmap::validate_history_file_id(file_id)?;
    let backup = root
        .join(".bit/bitmap-history")
        .join(format!(".bitmap-{file_id}"));
    let metadata = root.join(".bit/bitmap-history-metadata.txt");
    safe_destination(root, &backup)?;
    let metadata_before = match fs::read(&metadata) {
        Ok(bytes) => Some(bytes),
        Err(error) if error.kind() == io::ErrorKind::NotFound => None,
        Err(error) => return Err(error),
    };
    if metadata_before.is_some() && !fs::symlink_metadata(&metadata)?.is_file() {
        return Err(invalid("inbound bitmap history metadata type"));
    }
    Ok(History { backup, metadata, metadata_before, file_id: file_id.to_owned() })
}

fn bitmap_schema(rows: &mut Map<String, Value>) -> io::Result<Value> {
    if rows.get("$schema-version").and_then(Value::as_str) != Some("17.0.0")
        || rows.contains_key("_bit_lane")
    {
        return Err(invalid("inbound workspace bitmap lifecycle"));
    }
    rows.shift_remove("$schema-version").ok_or_else(|| invalid("inbound bitmap schema"))
}

fn prepare_target(
    root: &Path,
    template: &str,
    target: &Target,
    import: &PreparedImport,
    rows: &mut Map<String, Value>,
    directories: &mut HashSet<String>,
) -> io::Result<Vec<(PathBuf, Vec<u8>)>> {
    let scope = target.scope.as_deref().ok_or_else(|| invalid("inbound workspace scope"))?;
    unique_name(rows, &target.name)?;
    let model = import.overlay
        .models()
        .into_iter()
        .find(|model| model["scope"] == scope && model["name"] == target.name)
        .ok_or_else(|| invalid("inbound imported model"))?;
    let (version_name, hash) = version(model, &target.version)?;
    let version = import.overlay
        .read(&hash, "Version")?
        .ok_or_else(|| invalid("inbound imported Version"))?;
    crate::history_query::validate_version(version)?;
    let main = version["mainFile"].as_str().ok_or_else(|| invalid("inbound main file"))?;
    crate::checkout::plan::relative_path(main)?;
    let directory = directory(template, scope, &target.name)?;
    if !directories.insert(directory.clone()) || root.join(&directory).try_exists()? {
        return Err(invalid("inbound workspace destination occupied"));
    }
    safe_destination(root, &root.join(&directory))?;
    let files = target_files(root, &directory, version, main, import)?;
    rows.insert(
        target.name.clone(),
        json!({"name":target.name,"scope":scope,
        "version":version_name,"mainFile":main,"rootDir":directory}),
    );
    Ok(files)
}

fn target_files(
    root: &Path,
    directory: &str,
    version: &Value,
    main: &str,
    import: &PreparedImport,
) -> io::Result<Vec<(PathBuf, Vec<u8>)>> {
    let rows = version["files"].as_array().ok_or_else(|| invalid("inbound Version files"))?;
    if rows.is_empty() || rows.len() > 4096 {
        return Err(invalid("inbound workspace files"));
    }
    let mut files = Vec::with_capacity(rows.len());
    let mut seen = HashSet::new();
    for file in rows {
        let relative = file["relativePath"].as_str().ok_or_else(|| invalid("inbound file path"))?;
        crate::checkout::plan::relative_path(relative)?;
        if !seen.insert(relative) {
            return Err(invalid("inbound duplicate file"));
        }
        let hash = file["file"].as_str().ok_or_else(|| invalid("inbound Source hash"))?;
        crate::merge_history::hash(hash)?;
        let source =
            import.overlay.source(hash).ok_or_else(|| invalid("inbound imported Source"))?;
        let path = root.join(directory).join(relative);
        safe_destination(root, &path)?;
        files.push((path, crate::checkout::eol::auto(source.to_vec())));
    }
    if !seen.contains(main) {
        return Err(invalid("inbound main file missing"));
    }
    Ok(files)
}

impl Prepared {
    pub(super) fn commit(self) -> io::Result<()> {
        self.check_bitmap("before publication")?;
        self.history.check(&self.root)?;
        for (path, _) in &self.files {
            safe_destination(&self.root, path)?;
        }
        let created_dirs = self.missing_directories()?;
        let mut written = Vec::new();
        let mut history_published = false;
        let result = (|| {
            self.publish_files(&mut written)?;
            self.check_bitmap("during publication")?;
            self.history.publish(&self.root, &self.bitmap_before)?;
            history_published = true;
            self.publish_bitmap()
        })();
        if result.is_err() {
            if history_published {
                self.history.rollback();
            }
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
        for (path, _) in &self.files {
            let mut parent = path.parent().ok_or_else(|| invalid("inbound destination parent"))?;
            while parent != self.root && !parent.exists() {
                dirs.insert(parent.to_owned());
                parent = parent.parent().ok_or_else(|| invalid("inbound destination ancestor"))?;
            }
        }
        Ok(dirs)
    }

    fn publish_files(&self, written: &mut Vec<PathBuf>) -> io::Result<()> {
        for (path, body) in &self.files {
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

fn safe_destination(root: &Path, path: &Path) -> io::Result<()> {
    let relative = path.strip_prefix(root).map_err(io::Error::other)?;
    let mut current = root.to_owned();
    for part in relative.components() {
        current.push(part);
        match fs::symlink_metadata(&current) {
            Ok(metadata) if current != path && metadata.is_dir() => {}
            Ok(_) => return Err(invalid("inbound workspace destination occupied or linked")),
            Err(error) if error.kind() == io::ErrorKind::NotFound => {}
            Err(error) => return Err(error),
        }
    }
    Ok(())
}

fn unique_name(rows: &Map<String, Value>, name: &str) -> io::Result<()> {
    if rows.contains_key(name)
        || rows
            .values()
            .any(|row| row["name"] == name)
    {
        return Err(invalid("inbound existing workspace component requires canonical writer"));
    }
    Ok(())
}

fn version(model: &Value, requested: &str) -> io::Result<(String, String)> {
    let hash = if requested == "latest" {
        model["head"].as_str()
    } else if crate::merge_history::hash(requested).is_ok() {
        Some(requested)
    } else {
        model["versions"][requested]
            .as_str()
            .or_else(|| model["orphanedVersions"][requested].as_str())
    }
    .ok_or_else(|| invalid("inbound requested version"))?;
    crate::merge_history::hash(hash)?;
    let name = model["versions"]
        .as_object()
        .and_then(|versions| {
            versions
                .iter()
                .rev()
                .find(|(_, value)| value.as_str() == Some(hash))
        })
        .map_or_else(|| hash.to_owned(), |(tag, _)| tag.clone());
    Ok((name, hash.to_owned()))
}

fn directory(template: &str, scope: &str, name: &str) -> io::Result<String> {
    let (owner, short) = scope
        .rsplit_once('.')
        .unwrap_or(("", scope));
    let path = template
        .replace("{scopeId}", scope)
        .replace("{scope}", short)
        .replace("{owner}", owner)
        .replace("{name}", name);
    if path.contains('{') || path.contains('}') || path == "." {
        return Err(invalid("inbound unsupported workspace directory template"));
    }
    crate::checkout::plan::relative_path(&path)?;
    Ok(path)
}

#[cfg(test)]
mod tests;
