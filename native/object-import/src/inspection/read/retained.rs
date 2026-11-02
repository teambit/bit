//! Retained workspace snapshot observation lookup ([`load`], [`load_shared`]) and shared [`Budget`] accounting.

use super::{hash, invalid, raw, wire};
use crate::{
    read_budget::Budget,
    workspace::snapshots::{Observation, State},
};
use std::io;

/// Loads raw file bytes, size, and SHA-1 digest from disk or retained `snapshots`.
pub(super) fn load(
    file: &wire::Input,
    maximum: usize,
    snapshots: Option<&crate::workspace::snapshots::State>,
) -> io::Result<(Vec<u8>, usize, String)> {
    if file.read_token.is_none() {
        let bytes = raw(&file.path, maximum)?;
        let length = bytes.len();
        let digest = hash(&bytes);
        return Ok((bytes, length, digest));
    }
    let snapshot = observed(file, maximum, snapshots)?;
    Ok((snapshot.contents.to_vec(), snapshot.raw_bytes, snapshot.raw_hash.clone()))
}

/// Loads raw file bytes, size, and SHA-1 digest using a shared parallel [`Budget`].
pub(super) fn load_shared(
    file: &wire::Input,
    budget: &Budget,
    snapshots: Option<&State>,
) -> io::Result<(Vec<u8>, usize, String)> {
    if file.read_token.is_none() {
        let bytes = super::raw_shared(&file.path, budget)?;
        let length = bytes.len();
        let digest = hash(&bytes);
        return Ok((bytes, length, digest));
    }
    let snapshot = observed(file, super::super::MAX_BYTES, snapshots)?;
    budget.reserve(snapshot.raw_bytes.max(snapshot.contents.len()))?;
    Ok((snapshot.contents.to_vec(), snapshot.raw_bytes, snapshot.raw_hash.clone()))
}

/// Looks up and verifies a retained workspace [`Observation`] for `file` within `maximum` bytes.
fn observed<'a>(
    file: &wire::Input,
    maximum: usize,
    snapshots: Option<&'a State>,
) -> io::Result<&'a Observation> {
    if !file.path.is_absolute() {
        return Err(invalid("inspection unsupported path"));
    }
    let token = file.read_token.ok_or_else(|| invalid("inspection retained token"))?;
    let expected = verified_hash(file.raw_hash.as_deref(), "inspection retained raw hash")?;
    let state = snapshots.ok_or_else(|| invalid("inspection retained workspace observation"))?;
    let snapshot_hash =
        verified_hash(file.snapshot_hash.as_deref(), "inspection retained workspace observation")?;
    state
        .get(token, &file.path, expected)
        .filter(|snapshot| {
            snapshot.raw_bytes.max(snapshot.contents.len()) <= maximum
                && snapshot_hash.eq_ignore_ascii_case(snapshot.snapshot_hash.trim())
        })
        .ok_or_else(|| invalid("inspection retained workspace observation"))
}

#[inline]
fn verified_hash<'a>(value: Option<&'a str>, message: &'static str) -> io::Result<&'a str> {
    let trimmed = value
        .map(str::trim)
        .filter(|hash| !hash.is_empty())
        .ok_or_else(|| invalid(message))?;
    crate::merge_history::hash(trimmed)?;
    Ok(trimmed)
}
