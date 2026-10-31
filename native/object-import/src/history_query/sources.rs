use super::invalid;
use serde_json::{Value, json};
use std::{
    collections::HashMap,
    fs::{self, OpenOptions},
    io::{self, Write},
    path::PathBuf,
    sync::atomic::{AtomicUsize, Ordering},
};

static NEXT: AtomicUsize = AtomicUsize::new(0);
#[derive(Default)]
pub(super) struct Cache {
    records: HashMap<String, crate::checkout::repository::SourceRecord>,
    pub(super) bytes: usize,
    pub(super) limit: usize,
}
impl Cache {
    fn read(
        &mut self,
        directory: &std::path::Path,
        hash: &str,
        compressed: &mut usize,
    ) -> io::Result<(crate::checkout::repository::SourceRecord, bool)> {
        let digest = crate::merge_history::hash(hash.trim())?;
        let canonical = crate::validate::hexadecimal(&digest);
        if let Some(record) = self.records.get(&canonical) {
            return Ok((record.clone(), false));
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
        self.records.insert(canonical, record.clone());
        Ok((record, true))
    }
}
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
        let canonical = crate::validate::hexadecimal(&crate::merge_history::hash(hash.trim())?);
        if let Some(value) = self.values.get(&canonical) {
            self.loads.push(value.index);
            return Ok(value.body.clone());
        }
        let (record, fresh) = self.cache.read(&self.directory, &canonical, &mut self.compressed)?;
        if fresh {
            self.raw = self.raw
                .checked_add(record.body.len())
                .ok_or_else(|| invalid("history Source owner limit"))?;
        }
        let index = self.descriptors.len();
        self.descriptors.push(self.snapshot(&canonical, &record)?);
        self.loads.push(index);
        self.values.insert(canonical, Stored { body: record.body.clone(), index, fresh });
        Ok(record.body)
    }
    fn snapshot(
        &self,
        hash: &str,
        record: &crate::checkout::repository::SourceRecord,
    ) -> io::Result<Value> {
        let mut descriptor = json!({"hash":hash,"compressedSize":record.compressed.len(),"inflatedSize":record.inflated_size});
        if let Some(directory) = &self.snapshot_directory {
            let path = directory.join(format!(
                "source-{}-{}-{hash}.object",
                std::process::id(),
                NEXT.fetch_add(1, Ordering::Relaxed),
            ));
            let mut file = OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(&path)?;
            file.write_all(&record.compressed)?;
            descriptor["privatePath"] = json!(path);
        }
        Ok(descriptor)
    }
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
