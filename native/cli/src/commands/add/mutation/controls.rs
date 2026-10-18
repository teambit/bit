//! Retain current control facts across callbacks and later authoritative captures.
#[cfg(test)]
mod tests;

use crate::commands::{engine::Engine, status::capture::Capture};
use serde_json::{Value, json};
use std::{
    fs,
    io::{self, Read},
    path::Path,
};

const KEY: &str = "identityControlReadSet";
const MAX_CONTROL: u64 = 32 * 1024 * 1024;

pub(super) fn validate(engine: &mut Engine, context: &Value) -> io::Result<()> {
    engine.validate_read_set(
        context["controlReadSet"]
            .as_array()
            .map_or(&[], Vec::as_slice),
        "identity controls changed before component loading",
    )
}

pub(super) fn retain(context: &Value, capture: &mut Capture) -> io::Result<()> {
    let current = context["controlReadSet"]
        .as_array()
        .into_iter()
        .flatten()
        .map(|proof| {
            let path = proof["path"]
                .as_str()
                .ok_or_else(|| io::Error::other("identity control proof path"))?;
            refresh(Path::new(path))
        })
        .collect::<io::Result<Vec<_>>>()?;
    // A callback may intentionally update configuration. Keep its new preimage;
    // subsequent captures re-read the authoritative context rather than old facts.
    capture.environment_facts[KEY] = json!(current);
    Ok(())
}

pub(super) fn reads(facts: &Value) -> &[Value] {
    facts[KEY]
        .as_array()
        .map_or(&[], Vec::as_slice)
}

pub(super) fn refresh(path: &Path) -> io::Result<Value> {
    match fs::symlink_metadata(path) {
        Ok(metadata)
            if !metadata.is_file()
                || metadata.file_type().is_symlink()
                || metadata.len() > MAX_CONTROL =>
        {
            return Err(io::Error::other("identity control file shape or budget"));
        }
        Ok(_) => {}
        Err(error) if error.kind() == io::ErrorKind::NotFound => {}
        Err(error) => return Err(error),
    }
    let file = match fs::File::open(path) {
        Ok(file) => file,
        Err(error) if error.kind() == io::ErrorKind::NotFound => {
            return Ok(bit_install::policy::scope::proof_from_bytes(path, None));
        }
        Err(error) => return Err(error),
    };
    bounded_proof(path, file)
}

fn bounded_proof(path: &Path, file: fs::File) -> io::Result<Value> {
    if !file.metadata()?.is_file() {
        return Err(io::Error::other("identity control file shape"));
    }
    let mut bytes = Vec::new();
    file.take(MAX_CONTROL + 1)
        .read_to_end(&mut bytes)?;
    if bytes.len() as u64 > MAX_CONTROL {
        return Err(io::Error::other("identity control file budget"));
    }
    Ok(bit_install::policy::scope::proof_from_bytes(path, Some(&bytes)))
}
