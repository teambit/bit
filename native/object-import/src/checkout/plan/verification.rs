use super::{ManifestFile, hash, invalid, manifest, metadata, same_manifest, validate_files};
use serde_json::Value;
use std::{io, path::Path};
pub(crate) fn verify_manifest(
    directory: &Path,
    expected_hash: &str,
    expected: &Value,
    compressed: &mut usize,
) -> io::Result<()> {
    let version = metadata(directory, hash(expected_hash)?, "Version", compressed)?;
    verify_manifest_value(&version, expected)
}
pub(crate) fn verify_manifest_value(version: &Value, expected: &Value) -> io::Result<()> {
    let expected: Vec<ManifestFile> =
        serde_json::from_value(expected.clone()).map_err(io::Error::other)?;
    validate_files(&expected)?;
    let stored = manifest(version)?;
    if !same_manifest(&stored, &expected) {
        return Err(invalid("checkout live Version manifest differs"));
    }
    Ok(())
}
