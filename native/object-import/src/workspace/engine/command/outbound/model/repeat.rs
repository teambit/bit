//! A selected, already-exported component still gets a remote persistence
//! round with zero objects and no local Version promotion.
use super::{Staged, invalid};
use serde_json::Value;
use std::io;

#[inline]
pub(super) fn select(model: &Value) -> io::Result<Staged> {
    let head = non_empty(&model["head"]).ok_or_else(|| invalid("outbound head"))?;
    let head = crate::validate::hexadecimal(&crate::merge_history::hash(head)?);
    Ok(Staged { head, hashes: Vec::new(), labels: Vec::new() })
}

#[inline]
fn non_empty(val: &Value) -> Option<&str> {
    val.as_str()
        .or_else(|| val["ref"].as_str())
        .or_else(|| val["hash"].as_str())
        .map(str::trim)
        .filter(|text| !text.is_empty())
}
