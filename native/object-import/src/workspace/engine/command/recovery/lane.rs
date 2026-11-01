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
    let Some(header) = current
        .get("_bit_lane")
        .filter(|val| !val.is_null())
    else {
        return Ok(None);
    };
    if header.get("id").is_some_and(Value::is_null) {
        return Ok(None);
    }
    let (scope, name) = super::super::inbound::remote::file_list::row_scoped_id_parts(header)
        .ok_or_else(|| invalid("recovery lane scope"))?;
    let (hash, value) = read_backup(root, proofs)?;
    if value["scope"].as_str().map(str::trim) != Some(scope)
        || value["name"].as_str().map(str::trim) != Some(name)
    {
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
    let mut fields = header.split(' ');
    let (Some("Lane"), Some(raw_hash), Some(_), None) =
        (fields.next(), fields.next(), fields.next(), fields.next())
    else {
        return Err(invalid("recovery Lane type"));
    };
    let hash = crate::validate::hexadecimal(&crate::merge_history::hash(raw_hash)?);
    let value: Value = crate::parse_jsonc(&raw[nul + 1..]).map_err(io::Error::other)?;
    Ok((hash, value))
}
fn validate_index(
    root: &Path,
    hash: &str,
    scope: &str,
    name: &str,
    proofs: &mut Vec<proof::Proof>,
) -> io::Result<()> {
    let index: Value = crate::parse_jsonc(
        &proof::read(&crate::scope_path(root).join("index.json"), proofs)?
            .ok_or_else(|| invalid("recovery index"))?,
    )
    .map_err(io::Error::other)?;
    if !index["lanes"]
        .as_array()
        .is_some_and(|rows| {
            rows.iter()
                .any(|row| {
                    row["hash"]
                        .as_str()
                        .map(str::trim)
                        .is_some_and(|row_hash| row_hash.eq_ignore_ascii_case(hash))
                        && super::super::inbound::remote::file_list::row_lane_matches(
                            row, scope, name,
                        )
                })
        })
    {
        return Err(invalid("recovery Lane index repair requires planner"));
    }
    Ok(())
}
impl Lane {
    #[inline]
    pub(super) fn validate(&self) -> io::Result<()> {
        self.snapshot.validate()
    }
    #[inline]
    pub(super) fn publish(&mut self, root: &Path) -> io::Result<()> {
        self.snapshot.commit(root)
    }
}
