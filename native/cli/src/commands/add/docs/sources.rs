//! Retain bounded [`Source`] bytes and exact modification times around documentation decisions.
//!
//! Enforces [`LIMIT`] across observed source files for `ComponentFsCache` staleness checks.
use serde_json::Value;
use std::{
    collections::BTreeMap,
    fs,
    io::{self, Read},
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};
/// Maximum total byte budget (96 MiB) for observed documentation source files in [`observe`].
const LIMIT: u64 = 96 * 1024 * 1024;

/// Observed source file bytes and filesystem modification timestamp.
#[derive(PartialEq)]
pub(super) struct Source {
    bytes: Vec<u8>,
    modified: SystemTime,
}
impl Source {
    /// Returns the raw byte slice of this observed [`Source`].
    #[inline]
    pub(super) fn bytes(&self) -> &[u8] {
        &self.bytes
    }
    /// Returns the modification time of this [`Source`] in fractional milliseconds since [`UNIX_EPOCH`].
    #[inline]
    pub(super) fn mtime_ms(&self) -> f64 {
        match self.modified.duration_since(UNIX_EPOCH) {
            Ok(duration) => milliseconds(duration),
            Err(error) => -milliseconds(error.duration()),
        }
    }
}
#[inline]
fn milliseconds(duration: std::time::Duration) -> f64 {
    (duration.as_secs() as f64).mul_add(1000.0, f64::from(duration.subsec_nanos()) / 1_000_000.0)
}

/// Observes non-test component source files under `root` within the shared [`LIMIT`] byte budget.
pub(super) fn observe(root: &Path, components: &[Value]) -> io::Result<BTreeMap<PathBuf, Source>> {
    let mut output = BTreeMap::new();
    let mut remaining = LIMIT;
    for component in components {
        let directory = component["directory"]
            .as_str()
            .or_else(|| component["rootDir"].as_str())
            .map(str::trim)
            .filter(|dir| !dir.is_empty())
            .ok_or_else(|| io::Error::other("tracking docs directory"))?;
        for file in
            component["files"].as_array().ok_or_else(|| io::Error::other("tracking docs files"))?
        {
            if file["test"] == true {
                continue;
            }
            let relative = relative_path(directory, file)?;
            let path: PathBuf = root
                .join(directory)
                .join(relative)
                .components()
                .collect();
            let source = read_source(&path, &mut remaining)?;
            output.insert(path, source);
            if output.len() > 16384 {
                return Err(io::Error::other("tracking docs file count budget"));
            }
        }
    }
    Ok(output)
}

#[inline]
fn relative_path<'a>(directory: &str, file: &'a Value) -> io::Result<&'a str> {
    let relative = file["relativePath"]
        .as_str()
        .or_else(|| file["path"].as_str())
        .or_else(|| file.as_str())
        .map(str::trim)
        .filter(|rel| !rel.is_empty())
        .ok_or_else(|| io::Error::other("tracking docs relative path"))?;
    if Path::new(directory).is_absolute()
        || Path::new(relative).is_absolute()
        || Path::new(directory)
            .components()
            .any(|part| matches!(part, std::path::Component::ParentDir))
        || Path::new(relative)
            .components()
            .any(|part| matches!(part, std::path::Component::ParentDir))
    {
        return Err(io::Error::other("tracking docs relative path"));
    }
    Ok(relative)
}

fn read_source(path: &Path, remaining: &mut u64) -> io::Result<Source> {
    if !fs::symlink_metadata(path)?.is_file() {
        return Err(io::Error::other("tracking docs nonordinary source"));
    }
    let file = fs::File::open(path)?;
    let metadata = file.metadata()?;
    let modified = metadata.modified()?;
    let capacity = usize::try_from(metadata.len().min(*remaining)).unwrap_or(0);
    let mut bytes = Vec::with_capacity(capacity);
    file.take(*remaining + 1)
        .read_to_end(&mut bytes)?;
    *remaining = remaining
        .checked_sub(bytes.len() as u64)
        .ok_or_else(|| io::Error::other("tracking docs source budget"))?;
    Ok(Source { bytes, modified })
}
