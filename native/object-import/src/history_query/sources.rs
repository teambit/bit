//! Bounded `Source` object cache ([`Cache`]) and temporary snapshot file materialization for history queries.

use super::invalid;
use serde_json::{Value, json};
use std::{
    collections::HashMap,
    fs::{self, OpenOptions},
    io::{self, Write},
    path::PathBuf,
    sync::atomic::{AtomicUsize, Ordering},
};

/// Monotonic counter used to disambiguate temporary snapshot filenames within a process.
static NEXT: AtomicUsize = AtomicUsize::new(0);
/// Bounded in-memory cache of inflated `Source` object records for a history query session.
#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub(super) struct Cache {
    records: HashMap<String, crate::checkout::repository::SourceRecord>,
    pub(super) bytes: usize,
    pub(super) limit: usize,
}
impl Cache {
    /// Reads or reuses the inflated `Source` record for `canonical` (`digest`) within `self.limit`.
    fn read(
        &mut self,
        directory: &std::path::Path,
        digest: [u8; 20],
        canonical: &str,
        compressed: &mut usize,
    ) -> io::Result<(&crate::checkout::repository::SourceRecord, bool)> {
        if self.records.contains_key(canonical) {
            return Ok((&self.records[canonical], false));
        }
        if self.records.len() >= 4096 {
            return Err(invalid("history Source record limit"));
        }
        let record = crate::checkout::repository::source_record(
            directory,
            digest,
            32 * 1024 * 1024,
            compressed,
        )?;
        let size = record.body
            .len()
            .checked_add(record.compressed.len())
            .ok_or_else(|| invalid("history Source owner limit"))?;
        let next_bytes = self.bytes
            .checked_add(size)
            .filter(|bytes| *bytes <= self.limit)
            .ok_or_else(|| invalid("history Source owner limit"))?;
        self.bytes = next_bytes;
        Ok((self.records.entry(canonical.to_owned()).or_insert(record), true))
    }
}
/// Per-query `Source` object reader and optional snapshot file materializer backed by [`Cache`].
#[derive(Debug, PartialEq, Eq)]
pub(super) struct Sources<'a> {
    directory: PathBuf,
    cache: &'a mut Cache,
    snapshot_directory: Option<PathBuf>,
    raw: usize,
    compressed: usize,
    values: HashMap<String, Stored>,
    descriptors: Vec<Value>,
    loads: Vec<usize>,
}
/// Per-query cached `Source` body entry with its descriptor `index` and `fresh` load flag in [`Sources`].
#[derive(Debug, Clone, PartialEq, Eq)]
struct Stored {
    body: Vec<u8>,
    index: usize,
    fresh: bool,
}
impl Sources<'_> {
    pub(super) fn new(
        directory: PathBuf,
        snapshot_directory: Option<PathBuf>,
        cache: &mut Cache,
    ) -> io::Result<Sources<'_>> {
        crate::merge_history::path(&directory)?;
        if let Some(path) = &snapshot_directory {
            crate::merge_history::path(path)?;
            let metadata = fs::symlink_metadata(path)?;
            if metadata.file_type().is_symlink() || !metadata.is_dir() {
                return Err(invalid("history Source snapshot directory"));
            }
        }
        Ok(Sources {
            directory,
            cache,
            snapshot_directory,
            raw: 0,
            compressed: 0,
            values: HashMap::new(),
            descriptors: Vec::new(),
            loads: Vec::new(),
        })
    }
    pub(super) fn read(&mut self, hash: &str) -> io::Result<Vec<u8>> {
        if self.loads.len() >= 16384 {
            return Err(invalid("history Source load limit"));
        }
        let digest = crate::merge_history::hash(hash.trim())?;
        let canonical = crate::validate::hexadecimal(&digest);
        if let Some(value) = self.values.get(&canonical) {
            self.loads.push(value.index);
            return Ok(value.body.clone());
        }
        let (record, fresh) =
            self.cache.read(&self.directory, digest, &canonical, &mut self.compressed)?;
        let body = record.body.clone();
        if fresh {
            self.raw = self.raw
                .checked_add(body.len())
                .ok_or_else(|| invalid("history Source owner limit"))?;
        }
        let index = self.descriptors.len();
        self.descriptors.push(snapshot(self.snapshot_directory.as_deref(), &canonical, record)?);
        self.loads.push(index);
        self.values.insert(canonical, Stored { body: body.clone(), index, fresh });
        Ok(body)
    }
    #[inline]
    pub(super) fn text(&mut self, hash: &str) -> io::Result<String> {
        Ok(String::from_utf8_lossy(&self.read(hash)?).into_owned())
    }
    pub(super) fn response(&self, output: &mut Value) {
        output["sources"] = json!(self.descriptors);
        output["sourceLoads"] = json!(self.loads);
        output["reads"] = super::reads(
            (0, 0),
            (
                self.values
                    .values()
                    .filter(|value| value.fresh)
                    .count(),
                self.raw,
            ),
            0,
        );
    }
}

fn snapshot(
    snapshot_directory: Option<&std::path::Path>,
    hash: &str,
    record: &crate::checkout::repository::SourceRecord,
) -> io::Result<Value> {
    let mut descriptor = json!({"hash":hash,"compressedSize":record.compressed.len(),"inflatedSize":record.inflated_size});
    if let Some(directory) = snapshot_directory {
        let (path, mut file) = create_snapshot_file(directory, hash)?;
        if let Err(error) = file.write_all(&record.compressed).and_then(|()| file.flush()) {
            let _ = fs::remove_file(&path);
            return Err(error);
        }
        descriptor["privatePath"] = json!(path);
    }
    Ok(descriptor)
}
fn create_snapshot_file(
    directory: &std::path::Path,
    hash: &str,
) -> io::Result<(PathBuf, fs::File)> {
    for _ in 0..64 {
        let path = directory.join(format!(
            "source-{}-{}-{hash}.object",
            std::process::id(),
            NEXT.fetch_add(1, Ordering::Relaxed),
        ));
        match OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&path)
        {
            Ok(file) => return Ok((path, file)),
            Err(error) if error.kind() == io::ErrorKind::AlreadyExists => continue,
            Err(error) => return Err(error),
        }
    }
    Err(invalid("history Source snapshot path collision"))
}
