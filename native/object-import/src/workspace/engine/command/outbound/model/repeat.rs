//! A selected, already-exported component still gets a remote persistence
//! round via [`select`] and [`non_empty`] into [`Staged`] with zero objects and no local `Version` promotion.

use super::{Staged, invalid};
use serde_json::Value;
use std::io;

/// Builds a zero-object [`Staged`] selection from `model["head"]` via [`non_empty`] and [`invalid`] for an already-exported component.
#[inline]
pub(super) fn select(model: &Value) -> io::Result<Staged> {
    let head = non_empty(&model["head"]).ok_or_else(|| invalid("outbound head"))?;
    let head = crate::validate::hexadecimal(&crate::merge_history::hash(head)?);
    Ok(Staged { head, hashes: Vec::new(), labels: Vec::new() })
}

/// Extracts a trimmed non-empty string or `ref`/`hash` field from `val` for [`select`] and [`Staged`].
#[inline]
fn non_empty(val: &Value) -> Option<&str> {
    val.as_str()
        .or_else(|| val["ref"].as_str())
        .or_else(|| val["hash"].as_str())
        .map(str::trim)
        .filter(|text| !text.is_empty())
}
