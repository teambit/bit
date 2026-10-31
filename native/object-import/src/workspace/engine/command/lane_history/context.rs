//! Project historical versions without changing the active lane or its heads.
mod additions;
mod metadata;
use super::{invalid, phase};
use crate::{
    command_import,
    workspace::engine::{client_status::config, status_context},
};
use serde_json::{Value, json};
use std::io;

pub(in crate::workspace::engine::command) fn prepare(
    request: &super::super::input::Prepare,
    pool: &rayon::ThreadPool,
) -> io::Result<(Value, Option<command_import::PreparedImport>)> {
    let phase = phase(&request.options).ok_or_else(|| invalid("history phase unresolved"))?;
    let bitmap = config::document(&request.root.join(".bitmap"))?;
    let settings = config::configuration_value(
        &request.root,
        &status_context::configuration::effective(&request.root, &request.home)?,
        true,
    )?;
    let mut context = metadata::read(request, pool, &bitmap, &settings, phase)?;
    let mut imported = command_import::prepare_cached(&request.root, &request.global_remotes_file)?;
    additions::attach_missing(request, &bitmap, &settings, &mut context, &mut imported)?;
    let id = super::super::lane_context::current_id(&bitmap, &imported.lane_scope()?)?;
    let current = imported.load_lane(&id)?.ok_or_else(|| invalid("history current lane absent"))?;
    context["lane"] = json!({"currentId":id,"current":current});
    super::super::prepare::extend_models(request, pool, &mut context, Some(&imported))?;
    attach_versions(request, &mut context)?;
    imported.validate()?;
    Ok((context, Some(imported)))
}
fn attach_versions(request: &super::super::input::Prepare, context: &mut Value) -> io::Result<()> {
    let phase = phase(&request.options).ok_or_else(|| invalid("history phase"))?;
    for row in context["targets"].as_array_mut().ok_or_else(|| invalid("history targets"))? {
        let row_id = row["identity"]
            .as_str()
            .or_else(|| row["id"].as_str())
            .map(|raw| {
                let raw = raw.trim();
                raw.rsplit_once('@').map_or(raw, |(base, _)| base.trim())
            });
        let (_, version) = phase.versions
            .iter()
            .find(|(id, _)| row_id == Some(id.trim()))
            .ok_or_else(|| invalid("history target membership"))?;
        row["historicalVersion"] = json!(version.trim());
    }
    Ok(())
}
