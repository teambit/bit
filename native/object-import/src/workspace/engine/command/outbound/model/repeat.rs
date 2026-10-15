//! A selected, already-exported component still gets a remote persistence
//! round with zero objects and no local Version promotion.
use super::{Staged, invalid};
use serde_json::Value;
use std::io;

pub(super) fn select(model: &Value) -> io::Result<Staged> {
    let head = model["head"].as_str().ok_or_else(|| invalid("outbound head"))?;
    crate::merge_history::hash(head)?;
    Ok(Staged {
        version: head.to_owned(),
        head: head.to_owned(),
        hashes: Vec::new(),
        labels: Vec::new(),
    })
}
