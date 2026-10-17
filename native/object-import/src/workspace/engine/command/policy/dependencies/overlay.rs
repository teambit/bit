use super::{Record, invalid, planning};
use crate::workspace::engine::source_overlay::SourceOverlay;
use serde_json::Value;
use std::io;

pub(super) fn prepare(record: &Record, planned: &planning::Planned) -> io::Result<SourceOverlay> {
    let merge = planned.merge.as_ref().ok_or_else(|| invalid("command dependency merge"))?;
    let policy = merge.policy.as_ref().ok_or_else(|| invalid("command dependency rows"))?;
    let mut overlay = SourceOverlay::new(&record.request.root)?;
    for row in policy.rows.iter().filter(|row| !row.baseline.scope_only) {
        let files = overlay_files(row, planned)?;
        let root = record.request.root.join(&row.baseline.directory);
        for file in files {
            overlay.insert_source(
                &root.join(
                    file["relativePath"].as_str().ok_or_else(|| invalid("command overlay path"))?,
                ),
                &file["source"],
            )?;
        }
        let current = planned.captured
            .iter()
            .find(|current| current.target.identity == row.identity)
            .ok_or_else(|| invalid("command overlay capture"))?;
        for file in &current.target.files {
            if !row.files.contains(file) {
                overlay.remove(&root.join(file))?;
            }
        }
    }
    overlay.seal()
}

fn overlay_files<'a>(
    row: &super::super::Row,
    planned: &'a planning::Planned,
) -> io::Result<&'a Vec<Value>> {
    let matches = |output: &Value| {
        output["id"]
            .as_str()
            .and_then(|id| id.rsplit_once('@'))
            .is_some_and(|(id, _)| id == row.identity)
    };
    if row.fast_forward {
        return planned.materials
            .iter()
            .find(|material| matches(&material.output))
            .map(|material| &material.files)
            .ok_or_else(|| invalid("command FF overlay"));
    }
    planned.merge
        .as_ref()
        .ok_or_else(|| invalid("command merge overlay"))?
        .materials
        .iter()
        .find(|material| matches(&material.output))
        .map(|material| &material.files)
        .ok_or_else(|| invalid("command merge overlay"))
}
