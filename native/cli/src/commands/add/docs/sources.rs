//! Retain bounded source bytes and exact modification times around documentation decisions.
use serde_json::Value;
use std::{
    collections::BTreeMap,
    fs,
    io::{self, Read},
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};
const LIMIT: u64 = 96 * 1024 * 1024;

#[derive(PartialEq)]
pub(super) struct Source {
    bytes: Vec<u8>,
    modified: SystemTime,
}
impl Source {
    pub(super) fn bytes(&self) -> &[u8] {
        &self.bytes
    }
    pub(super) fn mtime_ms(&self) -> f64 {
        match self.modified.duration_since(UNIX_EPOCH) {
            Ok(duration) => milliseconds(duration),
            Err(error) => -milliseconds(error.duration()),
        }
    }
}
fn milliseconds(duration: std::time::Duration) -> f64 {
    (duration.as_secs() as f64).mul_add(1000.0, f64::from(duration.subsec_nanos()) / 1_000_000.0)
}

pub(super) fn observe(root: &Path, components: &[Value]) -> io::Result<BTreeMap<PathBuf, Source>> {
    let mut output = BTreeMap::new();
    let mut remaining = LIMIT;
    for component in components {
        let directory = component["directory"]
            .as_str()
            .or_else(|| component["rootDir"].as_str())
            .ok_or_else(|| io::Error::other("tracking docs directory"))?;
        for file in
            component["files"].as_array().ok_or_else(|| io::Error::other("tracking docs files"))?
        {
            if file["test"] == true {
                continue;
            }
            let relative = file["relativePath"]
                .as_str()
                .or_else(|| file["path"].as_str())
                .or_else(|| file.as_str())
                .ok_or_else(|| io::Error::other("tracking docs relative path"))?;
            let path = root.join(directory).join(relative);
            let source = read_source(&path, &mut remaining)?;
            output.insert(path, source);
            if output.len() > 16384 {
                return Err(io::Error::other("tracking docs file count budget"));
            }
        }
    }
    Ok(output)
}

fn read_source(path: &Path, remaining: &mut u64) -> io::Result<Source> {
    if !fs::symlink_metadata(path)?.is_file() {
        return Err(io::Error::other("tracking docs nonordinary source"));
    }
    let file = fs::File::open(path)?;
    let modified = file.metadata()?.modified()?;
    let mut bytes = Vec::new();
    file.take(*remaining + 1)
        .read_to_end(&mut bytes)?;
    *remaining = remaining
        .checked_sub(bytes.len() as u64)
        .ok_or_else(|| io::Error::other("tracking docs source budget"))?;
    Ok(Source { bytes, modified })
}
