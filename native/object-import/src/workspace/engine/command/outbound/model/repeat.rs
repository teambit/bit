//! A selected, already-exported component still gets a remote persistence
//! round with zero objects and no local Version promotion.
use super::{Staged, invalid};
use serde_json::Value;
use std::io;

pub(super) fn select(model: &Value) -> io::Result<Staged> {
    let head = non_empty(&model["head"])
        .or_else(|| non_empty(&model["head"]["ref"]))
        .or_else(|| non_empty(&model["head"]["hash"]))
        .ok_or_else(|| invalid("outbound head"))?;
    crate::merge_history::hash(head)?;
    Ok(Staged { head: head.to_owned(), hashes: Vec::new(), labels: Vec::new() })
}

fn non_empty(val: &Value) -> Option<&str> {
    val.as_str()
        .map(str::trim)
        .filter(|text| !text.is_empty())
}
