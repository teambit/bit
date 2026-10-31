//! `StashFiles`' lexical next-name selection and four-space JSON publication.
use super::{invalid, observation::Observation};
use serde::Serialize;
use serde_json::Value;
use std::{fs, io, path::Path};
pub struct PreparedSave {
    observation: Observation,
    filename: String,
    bytes: Vec<u8>,
}
impl PreparedSave {
    /// Retain the metadata inventory before any detached objects are published.
    pub fn prepare(scope: &Path, data: &Value) -> io::Result<Self> {
        let observation = Observation::read(scope)?;
        let next = next_index(observation.latest())?;
        let filename = format!("stash-{next}.json");
        let mut bytes = Vec::new();
        let formatter = serde_json::ser::PrettyFormatter::with_indent(b"    ");
        let mut serializer = serde_json::Serializer::with_formatter(&mut bytes, formatter);
        data.serialize(&mut serializer).map_err(io::Error::other)?;
        if bytes.len() > 32 * 1024 * 1024 {
            return Err(invalid("stash metadata exceeds write budget"));
        }
        Ok(Self { observation, filename, bytes })
    }
    #[must_use]
    pub fn filename(&self) -> &str {
        &self.filename
    }
    /// Check that naming and metadata preimages still match the prepared operation.
    pub fn validate(&self) -> io::Result<()> {
        self.observation.validate()
    }
    /// Publish after detached Version and Source objects have been persisted.
    pub fn apply(&self) -> io::Result<()> {
        self.validate()?;
        let directory = self.observation.directory();
        fs::create_dir_all(directory)?;
        if fs::symlink_metadata(directory)?.file_type().is_symlink() {
            return Err(invalid("stash directory is not a regular directory"));
        }
        fs::write(directory.join(&self.filename), &self.bytes)
    }
}
fn next_index(latest: Option<&str>) -> io::Result<u64> {
    let Some(latest) = latest
        .map(str::trim)
        .filter(|name| !name.is_empty())
    else {
        return Ok(1);
    };
    let digits: String = latest
        .split('-')
        .nth(1)
        .unwrap_or_default()
        .chars()
        .take_while(char::is_ascii_digit)
        .collect();
    if digits.is_empty() {
        return Err(invalid("unsupported stash filename index"));
    }
    digits
        .parse::<u64>()
        .map_err(io::Error::other)?
        .checked_add(1)
        .ok_or_else(|| invalid("stash filename index overflow"))
}
