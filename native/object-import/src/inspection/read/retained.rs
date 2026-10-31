use super::{hash, invalid, raw, wire};
use crate::{
    read_budget::Budget,
    workspace::snapshots::{Observation, State},
};
use std::io;

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

fn observed<'a>(
    file: &wire::Input,
    maximum: usize,
    snapshots: Option<&'a State>,
) -> io::Result<&'a Observation> {
    let token = file.read_token.ok_or_else(|| invalid("inspection retained token"))?;
    let expected = file.raw_hash
        .as_deref()
        .map(str::trim)
        .filter(|hash| !hash.is_empty())
        .ok_or_else(|| invalid("inspection retained raw hash"))?;
    crate::merge_history::hash(expected)?;
    let snapshot_hash = file.snapshot_hash
        .as_deref()
        .map(str::trim)
        .filter(|hash| !hash.is_empty())
        .ok_or_else(|| invalid("inspection retained workspace observation"))?;
    crate::merge_history::hash(snapshot_hash)?;
    snapshots
        .and_then(|state| state.get(token, &file.path, expected))
        .filter(|snapshot| {
            file.path.is_absolute()
                && snapshot.raw_bytes.max(snapshot.contents.len()) <= maximum
                && file.snapshot_hash
                    .as_deref()
                    .is_some_and(|hash| {
                        hash.trim().eq_ignore_ascii_case(snapshot.snapshot_hash.trim())
                    })
        })
        .ok_or_else(|| invalid("inspection retained workspace observation"))
}
