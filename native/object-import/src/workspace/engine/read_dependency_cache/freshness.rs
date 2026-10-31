use super::invalid;
use rayon::prelude::*;
use std::{
    collections::HashSet,
    fs, io,
    path::{Path, PathBuf},
    time::{Duration, UNIX_EPOCH},
};

pub(super) fn stale(
    root: &Path,
    files: &[PathBuf],
    timestamp: f64,
    pool: &rayon::ThreadPool,
) -> io::Result<bool> {
    if !timestamp.is_finite() || timestamp < 0.0 {
        return Err(invalid("dependency cache timestamp"));
    }
    let directories = directories(root)?;
    pool.install(|| {
        directories
            .par_iter()
            .chain(files.par_iter())
            .map(|file| newer(file, timestamp))
            .try_reduce(|| false, |left, right| Ok(left || right))
    })
}
fn newer(path: &Path, timestamp: f64) -> io::Result<bool> {
    let metadata = match fs::metadata(path) {
        Ok(value) => value,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(false),
        Err(error) => return Err(error),
    };
    let time = metadata.modified()?;
    let milliseconds = match time.duration_since(UNIX_EPOCH) {
        Ok(time) => milliseconds(time),
        Err(error) => -milliseconds(error.duration()),
    };
    Ok(!milliseconds.is_finite() || milliseconds > timestamp)
}
#[expect(clippy::suboptimal_flops, reason = "match Node Stats' unfused timestamp arithmetic")]
fn milliseconds(time: Duration) -> f64 {
    time.as_secs() as f64 * 1000.0 + f64::from(time.subsec_nanos()) / 1_000_000.0
}

struct Directories {
    pending: Vec<PathBuf>,
    paths: Vec<PathBuf>,
    visited: HashSet<PathBuf>,
    entries: usize,
    bytes: usize,
}
fn directories(root: &Path) -> io::Result<Vec<PathBuf>> {
    let text = root
        .to_str()
        .map(str::trim)
        .filter(|text| !text.is_empty() && !text.contains('\0'))
        .ok_or_else(|| invalid("dependency cache directory UTF-8"))?;
    if text.contains(['*', '?', '[', ']', '{', '}', '!', '(', ')']) {
        return Err(invalid("dependency cache glob directory"));
    }
    let mut scan = Directories {
        pending: vec![root.to_path_buf()],
        paths: vec![root.to_path_buf()],
        visited: HashSet::new(),
        entries: 0,
        bytes: text.len(),
    };
    while let Some(directory) = scan.pending.pop() {
        scan.children(&directory)?;
    }
    Ok(scan.paths)
}
impl Directories {
    fn children(&mut self, directory: &Path) -> io::Result<()> {
        let metadata = match fs::metadata(directory) {
            Ok(value) => value,
            Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(()),
            Err(error) => return Err(error),
        };
        if !metadata.is_dir() {
            return Ok(());
        }
        // Repeated physical directories include cycles. Preserve canonical traversal
        // for those rather than silently treating a cyclic walk as complete.
        if !self.visited.insert(fs::canonicalize(directory)?) {
            return Err(invalid("dependency cache repeated directory"));
        }
        for entry in fs::read_dir(directory)? {
            self.entry(&entry?)?;
        }
        Ok(())
    }
    fn entry(&mut self, entry: &fs::DirEntry) -> io::Result<()> {
        self.entries += 1;
        if self.entries > 65536 {
            return Err(invalid("dependency cache directory entry limit"));
        }
        let name = entry.file_name();
        let name = name.to_str().ok_or_else(|| invalid("dependency cache directory UTF-8"))?;
        if name.starts_with('.') {
            return Ok(());
        }
        let kind = entry.file_type()?;
        if !(kind.is_dir() || kind.is_symlink() && fs::metadata(entry.path())?.is_dir()) {
            return Ok(());
        }
        let path = entry.path();
        self.bytes += path.as_os_str().len();
        if self.bytes > 8 * 1024 * 1024 {
            return Err(invalid("dependency cache directory bytes"));
        }
        self.paths.push(path.clone());
        self.pending.push(path);
        Ok(())
    }
}
