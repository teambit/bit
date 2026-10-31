use super::{MAX_RAW, count, invalid, path};
use std::{
    fs, io,
    path::{Path, PathBuf},
};
struct Scan<'a> {
    root: &'a Path,
    excluded: &'a [PathBuf],
    workspace_root: bool,
    directories: Vec<PathBuf>,
    paths: Vec<String>,
    entries: usize,
    bytes: usize,
    queued_bytes: usize,
}

pub(super) fn scan(
    root: &Path,
    excluded: &[PathBuf],
    workspace_root: bool,
) -> io::Result<Vec<String>> {
    if !validate(root, excluded, workspace_root)? {
        return Ok(Vec::new());
    }
    let mut scan = Scan {
        root,
        excluded,
        workspace_root,
        directories: vec![root.to_path_buf()],
        paths: Vec::new(),
        entries: 0,
        bytes: 0,
        queued_bytes: root.as_os_str().len(),
    };
    while let Some(directory) = scan.directories.pop() {
        scan.queued_bytes = scan.queued_bytes.saturating_sub(directory.as_os_str().len());
        for entry in fs::read_dir(directory)? {
            scan.entry(&entry?)?;
        }
    }
    scan.paths.sort_by(|left, right| left.encode_utf16().cmp(right.encode_utf16()));
    Ok(scan.paths)
}
fn validate(root: &Path, excluded: &[PathBuf], workspace_root: bool) -> io::Result<bool> {
    path(root)?;
    count(excluded.len())?;
    for directory in excluded {
        path(directory)?;
    }
    match fs::symlink_metadata(root) {
        Ok(metadata) if metadata.is_dir() => Ok(true),
        Err(error) if error.kind() == io::ErrorKind::NotFound && !workspace_root => Ok(false),
        Ok(_) => Err(invalid("workspace scan root type")),
        Err(error) => Err(error),
    }
}
impl Scan<'_> {
    fn entry(&mut self, entry: &fs::DirEntry) -> io::Result<()> {
        self.entries += 1;
        if self.entries > 65536 {
            return Err(invalid("workspace scan entry limit"));
        }
        let file = entry.path();
        let name = entry.file_name();
        let name = name.to_str().ok_or_else(|| invalid("workspace non-UTF8 filename"))?;
        if self.excluded(&file, name) {
            return Ok(());
        }
        let kind = entry.file_type()?;
        if kind.is_dir() {
            return self.directory(file, name);
        }
        if !kind.is_file() {
            return Err(invalid("workspace scan unsupported file type"));
        }
        self.file(&file, name)
    }
    fn excluded(&self, file: &Path, name: &str) -> bool {
        self.excluded
            .iter()
            .any(|directory| file.starts_with(directory))
            || matches!(name, ".git" | ".bit.map.json")
    }
    fn directory(&mut self, file: PathBuf, name: &str) -> io::Result<()> {
        if matches!(name, "node_modules" | ".bit" | ".bitTmp") {
            return Ok(());
        }
        path(&file)?;
        self.queued_bytes += file.as_os_str().len();
        if self.queued_bytes > MAX_RAW || self.directories.len() >= 65536 {
            return Err(invalid("workspace scan queued path bytes limit"));
        }
        self.directories.push(file);
        Ok(())
    }
    fn file(&mut self, file: &Path, name: &str) -> io::Result<()> {
        if ignore_bitmap(file, self.root, name, self.workspace_root) {
            return Ok(());
        }
        path(file)?;
        let name = file
            .to_str()
            .ok_or_else(|| invalid("workspace non-UTF8 path"))?
            .to_owned();
        self.bytes += name.len();
        if self.bytes > MAX_RAW {
            return Err(invalid("workspace scan path bytes limit"));
        }
        self.paths.push(name);
        count(self.paths.len())
    }
}
fn ignore_bitmap(file: &Path, root: &Path, name: &str, workspace_root: bool) -> bool {
    name == ".bitmap" && (workspace_root != (file.parent() == Some(root)))
}
