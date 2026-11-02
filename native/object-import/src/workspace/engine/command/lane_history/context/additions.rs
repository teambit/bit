//! Attach historical [`Phase`] component [`additions`] missing from the current workspace `.bitmap`.

use super::{command_import, invalid, phase};
use crate::workspace::engine::command::{
    input::Prepare,
    lane_context::{additions, visibility},
    lane_history::Phase,
};
use serde_json::{Value, json};
use std::io;
/// Attaches historical [`Phase`] components missing from `.bitmap` into `context["scopeAdditions"]` and `context["scopeAddedTargets"]`.
pub(super) fn attach_missing(
    request: &Prepare,
    bitmap: &Value,
    settings: &Value,
    context: &mut Value,
    imported: &mut command_import::PreparedImport,
) -> io::Result<()> {
    let phase = phase(&request.options).ok_or_else(|| invalid("history phase"))?;
    let selected = selected(phase, context, imported)?;
    let bitmap = visibility::identity_bitmap(bitmap, settings)?;
    let mut additions =
        additions::prepare_switch(imported, &request.root, &bitmap, settings, &selected)?;
    for row in &mut additions {
        let scope = row["scope"]
            .as_str()
            .map(str::trim)
            .filter(|scope| !scope.is_empty())
            .ok_or_else(|| invalid("lane addition scope"))?;
        let name = row["name"]
            .as_str()
            .map(str::trim)
            .filter(|name| !name.is_empty())
            .ok_or_else(|| invalid("lane addition name"))?;
        let version = phase.versions
            .iter()
            .find(|(identity, _)| {
                bare_id(identity)
                    .strip_prefix(scope)
                    .and_then(|rest| rest.strip_prefix('/'))
                    == Some(name)
            })
            .map(|(_, version)| version.trim())
            .filter(|version| !version.is_empty())
            .ok_or_else(|| invalid("lane addition version entry"))?;
        row["version"] = json!(version);
    }
    context["scopeAddedTargets"] = json!(additions::targets(&additions, &selected));
    context["scopeAdditions"] = json!(additions);
    Ok(())
}

/// Selects historical `phase` components that are not currently present in `context["targets"]`.
fn selected(
    phase: &Phase,
    context: &Value,
    imported: &mut command_import::PreparedImport,
) -> io::Result<Vec<Value>> {
    let existing = context["targets"].as_array().ok_or_else(|| invalid("history targets"))?;
    let mut selected = Vec::with_capacity(phase.versions.len());
    for (id, version) in &phase.versions {
        let id = bare_id(id);
        if existing
            .iter()
            .any(|row| row_bare_id(row) == Some(id))
        {
            continue;
        }
        let model = imported.lane_model(id)?.ok_or_else(|| invalid("history missing model"))?;
        let reference = crate::workspace::engine::command::selection::versions::reference(
            &model,
            version.trim(),
        )?;
        selected.push(
            json!({"identity":id,"head":reference,"bitmapPresent":false,"currentIdPresent":false}),
        );
    }
    Ok(selected)
}

/// Strips any trailing `@<version>` suffix from `raw` and returns the trimmed bare identity.
#[inline]
fn bare_id(raw: &str) -> &str {
    let raw = raw.trim();
    raw.rsplit_once('@').map_or(raw, |(base, _)| base.trim())
}

/// Extracts the bare `<scope>/<name>` identity from a target `row` (`identity` or `id`).
#[inline]
fn row_bare_id(row: &Value) -> Option<&str> {
    row["identity"]
        .as_str()
        .or_else(|| row["id"].as_str())
        .map(bare_id)
}
