use super::super::{invalid, merge::snapshot, proof, scratch};
use flate2::read::ZlibDecoder;
use serde_json::Value;
use std::{
    io::{self, Read},
    path::Path,
};
pub(super) struct Lane {
    snapshot: snapshot::Snapshot,
    _directory: scratch::Directory,
    pub(super) id: String,
}
pub(super) fn prepare(
    root: &Path,
    current: &Value,
    proofs: &mut Vec<proof::Proof>,
) -> io::Result<Option<Lane>> {
    let id = &current["_bit_lane"]["id"];
    if id.is_null() {
        return Ok(None);
    }
    let scope = id["scope"].as_str().ok_or_else(|| invalid("recovery lane scope"))?;
    let name = id["name"].as_str().ok_or_else(|| invalid("recovery lane name"))?;
    let (hash, value) = read_backup(root, proofs)?;
    if value["scope"] != scope || value["name"] != name {
        return Err(invalid("recovery Lane identity"));
    }
    validate_index(root, &hash, scope, name, proofs)?;
    let directory = scratch::Directory::create()?;
    let snapshot = snapshot::prepare_objects(
        &directory.0,
        vec![snapshot::object("Lane", Some(&hash), value)?],
    )?;
    Ok(Some(Lane { snapshot, _directory: directory, id: format!("{scope}/{name}") }))
}
fn read_backup(root: &Path, proofs: &mut Vec<proof::Proof>) -> io::Result<(String, Value)> {
    let bytes = proof::read(&crate::scope_path(root).join("last-merged/lane"), proofs)?
        .ok_or_else(|| invalid("recovery Lane backup absent"))?;
    let mut raw = Vec::new();
    ZlibDecoder::new(bytes.as_slice())
        .take(8 * 1024 * 1024 + 1)
        .read_to_end(&mut raw)?;
    if raw.len() > 8 * 1024 * 1024 {
        return Err(invalid("recovery Lane budget"));
    }
    let nul = raw
        .iter()
        .position(|byte| *byte == 0)
        .ok_or_else(|| invalid("recovery Lane header"))?;
    let header = std::str::from_utf8(&raw[..nul]).map_err(io::Error::other)?;
    let fields = header.split(' ').collect::<Vec<_>>();
    if fields.len() != 3 || fields[0] != "Lane" {
        return Err(invalid("recovery Lane type"));
    }
    crate::merge_history::hash(fields[1])?;
    let value: Value = serde_json::from_slice(&raw[nul + 1..]).map_err(io::Error::other)?;
    Ok((fields[1].to_owned(), value))
}
fn validate_index(
    root: &Path,
    hash: &str,
    scope: &str,
    name: &str,
    proofs: &mut Vec<proof::Proof>,
) -> io::Result<()> {
    let index: Value = serde_json::from_slice(
        &proof::read(&crate::scope_path(root).join("index.json"), proofs)?
            .ok_or_else(|| invalid("recovery index"))?,
    )
    .map_err(io::Error::other)?;
    if !index["lanes"]
        .as_array()
        .is_some_and(|rows| {
            rows.iter()
                .any(|row| {
                    row["hash"] == hash && row["id"]["scope"] == scope && row["id"]["name"] == name
                })
        })
    {
        return Err(invalid("recovery Lane index repair requires planner"));
    }
    Ok(())
}
impl Lane {
    pub(super) fn validate(&self) -> io::Result<()> {
        self.snapshot.validate()
    }
    pub(super) fn publish(&mut self, root: &Path) -> io::Result<()> {
        self.snapshot.commit(root)
    }
}
