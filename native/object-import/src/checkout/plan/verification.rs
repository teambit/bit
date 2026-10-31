use super::{ManifestFile, hash, invalid, manifest, metadata, same_manifest, validate_files};
use serde_json::Value;
use std::{io, path::Path};
pub(crate) fn verify_manifest(
    directory: &Path,
    expected_hash: &str,
    expected: &Value,
    compressed: &mut usize,
) -> io::Result<()> {
    let version = metadata(directory, hash(expected_hash.trim())?, "Version", compressed)?;
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

pub(super) fn plain_tag(tag: &str) -> bool {
    let tag = tag.trim();
    if tag.is_empty() || tag.len() > 256 {
        return false;
    }
    let (base, build) = tag
        .split_once('+')
        .map_or((tag, None), |(base, build)| (base, Some(build)));
    let (version, prerelease) = base
        .split_once('-')
        .map_or((base, None), |(version, prerelease)| (version, Some(prerelease)));
    let segments: Vec<_> = version.split('.').collect();
    segments.len() == 3
        && segments.iter().all(|segment| numeric_segment(segment))
        && prerelease.is_none_or(|value| identifiers(value, true))
        && build.is_none_or(|value| identifiers(value, false))
}

fn numeric_segment(value: &str) -> bool {
    !value.is_empty()
        && (value.len() == 1 || !value.starts_with('0'))
        && value.bytes().all(|byte| byte.is_ascii_digit())
        && value
            .parse::<u64>()
            .is_ok_and(|number| number <= 9_007_199_254_740_991)
}

fn identifiers(value: &str, numeric_strict: bool) -> bool {
    value.split('.').all(|segment| valid_identifier_segment(segment, numeric_strict))
}

fn valid_identifier_segment(segment: &str, numeric_strict: bool) -> bool {
    !segment.is_empty()
        && segment
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-')
        && (!numeric_strict
            || !segment.bytes().all(|byte| byte.is_ascii_digit())
            || numeric_segment(segment))
}
