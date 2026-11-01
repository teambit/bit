use super::{Record, invalid, planning};
use crate::workspace::engine::source_overlay::SourceOverlay;
use serde_json::Value;
use std::io;

pub(super) fn prepare(record: &Record, planned: &planning::Planned) -> io::Result<SourceOverlay> {
    let merge = planned.merge.as_ref().ok_or_else(|| invalid("command dependency merge"))?;
    let policy = merge.policy.as_ref().ok_or_else(|| invalid("command dependency rows"))?;
    let mut overlay = SourceOverlay::new(&record.request.root)?;
    for row in policy.rows.iter().filter(|row| !row.baseline.scope_only) {
        apply_row(&mut overlay, &record.request.root, row, planned)?;
    }
    overlay.seal()
}

fn apply_row(
    overlay: &mut SourceOverlay,
    workspace_root: &std::path::Path,
    row: &super::super::Row,
    planned: &planning::Planned,
) -> io::Result<()> {
    let files = overlay_files(row, planned)?;
    let directory = row.baseline.directory.trim();
    if directory != "." {
        crate::checkout::plan::relative_path(directory)?;
    }
    let root = workspace_root.join(directory);
    for file in files {
        let relative = file["relativePath"]
            .as_str()
            .map(str::trim)
            .filter(|path| !path.is_empty())
            .ok_or_else(|| invalid("command overlay path"))?;
        crate::checkout::plan::relative_path(relative)?;
        overlay.insert_source(&root.join(relative), &file["source"])?;
    }
    let current = planned.captured
        .iter()
        .find(|current| current.target.identity.trim() == row.identity.trim())
        .ok_or_else(|| invalid("command overlay capture"))?;
    for file in &current.target.files {
        let trimmed = file.trim();
        if !trimmed.is_empty()
            && !row.files
                .iter()
                .any(|item| item.trim() == trimmed)
        {
            crate::checkout::plan::relative_path(trimmed)?;
            overlay.remove(&root.join(trimmed))?;
        }
    }
    Ok(())
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
