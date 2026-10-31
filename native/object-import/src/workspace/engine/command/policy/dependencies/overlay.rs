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
    if row.fast_forward {
        return planned.materials
            .iter()
            .find(|material| matches_material_identity(&material.output, &row.identity))
            .map(|material| &material.files)
            .ok_or_else(|| invalid("command FF overlay"));
    }
    planned.merge
        .as_ref()
        .ok_or_else(|| invalid("command merge overlay"))?
        .materials
        .iter()
        .find(|material| matches_material_identity(&material.output, &row.identity))
        .map(|material| &material.files)
        .ok_or_else(|| invalid("command merge overlay"))
}

fn matches_material_identity(output: &Value, identity: &str) -> bool {
    let identity = identity.trim();
    if let Some(id) = output["id"]
        .as_str()
        .or_else(|| output["identity"].as_str())
        .map(str::trim)
        .filter(|id| !id.is_empty())
    {
        let base = id.rsplit_once('@').map_or(id, |(base, _)| base.trim());
        return base == identity;
    }
    output["id"]["name"]
        .as_str()
        .map(str::trim)
        .filter(|name| !name.is_empty())
        .is_some_and(|name| {
            output["id"]["scope"]
                .as_str()
                .map(str::trim)
                .filter(|scope| !scope.is_empty())
                .map_or_else(|| name == identity, |scope| format!("{scope}/{name}") == identity)
        })
}
