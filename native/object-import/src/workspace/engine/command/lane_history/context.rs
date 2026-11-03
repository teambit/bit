//! Project historical versions ([`prepare`]) without changing the active lane or its heads.

mod additions;
mod metadata;
use super::{invalid, phase};
use crate::{
    command_import,
    workspace::engine::{client_status::config, status_context},
};
use serde_json::{Value, json};
use std::io;

/// Prepares workspace context ([`metadata::read`], [`additions::attach_missing`], [`attach_versions`]) and [`command_import::PreparedImport`] lane objects for a historical [`super::Phase`] checkout.
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
    attach_versions(phase, &mut context)?;
    imported.validate()?;
    Ok((context, Some(imported)))
}
/// Attaches `historicalVersion` fields onto `context["targets"]` from [`super::Phase::versions`] entries for [`prepare`].
#[inline]
fn attach_versions(phase: &super::Phase, context: &mut Value) -> io::Result<()> {
    for row in context["targets"].as_array_mut().ok_or_else(|| invalid("history targets"))? {
        let row_id = row["identity"]
            .as_str()
            .map(str::trim)
            .filter(|raw| !raw.is_empty())
            .or_else(|| {
                row["id"]
                    .as_str()
                    .map(str::trim)
                    .filter(|raw| !raw.is_empty())
            })
            .map(|raw| raw.rsplit_once('@').map_or(raw, |(base, _)| base.trim()))
            .filter(|id| !id.is_empty())
            .ok_or_else(|| invalid("history target membership"))?;
        let (_, version) = phase.versions
            .iter()
            .find(|(id, _)| {
                let id = id.trim();
                let id = id.rsplit_once('@').map_or(id, |(base, _)| base.trim());
                id == row_id
            })
            .ok_or_else(|| invalid("history target membership"))?;
        let version = version.trim();
        if version.is_empty() {
            return Err(invalid("history target version"));
        }
        row["historicalVersion"] = json!(version);
    }
    Ok(())
}
