use super::{command_import, invalid, phase};
use serde_json::{Value, json};
use std::io;
pub(super) fn attach_missing(
    request: &crate::workspace::engine::command::input::Prepare,
    bitmap: &Value,
    settings: &Value,
    context: &mut Value,
    imported: &mut command_import::PreparedImport,
) -> io::Result<()> {
    let phase = phase(&request.options).ok_or_else(|| invalid("history phase"))?;
    let selected = selected(phase, context, imported)?;
    let bitmap = crate::workspace::engine::command::lane_context::visibility::identity_bitmap(
        bitmap, settings,
    )?;
    let mut additions = crate::workspace::engine::command::lane_context::additions::prepare_switch(
        imported,
        &request.root,
        &bitmap,
        settings,
        &selected,
    )?;
    for row in &mut additions {
        let scope = row["scope"].as_str().ok_or_else(|| invalid("lane addition scope"))?;
        let name = row["name"].as_str().ok_or_else(|| invalid("lane addition name"))?;
        let id = format!("{scope}/{name}");
        let version = &phase.versions
            .iter()
            .find(|(identity, _)| identity == &id)
            .ok_or_else(|| invalid("lane addition version entry"))?
            .1;
        row["version"] = json!(version);
    }
    context["scopeAddedTargets"] = json!(
        crate::workspace::engine::command::lane_context::additions::targets(&additions, &selected)
    );
    context["scopeAdditions"] = json!(additions);
    Ok(())
}

fn selected(
    phase: &crate::workspace::engine::command::lane_history::Phase,
    context: &Value,
    imported: &mut command_import::PreparedImport,
) -> io::Result<Vec<Value>> {
    let existing = context["targets"].as_array().ok_or_else(|| invalid("history targets"))?;
    let mut selected = Vec::new();
    for (id, version) in &phase.versions {
        if existing
            .iter()
            .any(|row| row["identity"] == *id)
        {
            continue;
        }
        let model = imported.lane_model(id)?.ok_or_else(|| invalid("history missing model"))?;
        let reference =
            crate::workspace::engine::command::selection::versions::reference(&model, version)?;
        selected.push(
            json!({"identity":id,"head":reference,"bitmapPresent":false,"currentIdPresent":false}),
        );
    }
    Ok(selected)
}
