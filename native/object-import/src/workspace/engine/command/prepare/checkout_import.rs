//! Checkout refresh uses remote lane versions before its selected target import.
use super::Prepare;
use crate::{command_import, workspace::engine::client_status::config};
use serde_json::Value;
use std::io;
pub(super) fn lane(
    request: &Prepare,
    context: &Value,
    targets: &[command_import::Target],
) -> io::Result<Option<command_import::PreparedImport>> {
    let bitmap = config::document(&request.root.join(".bitmap"))?;
    if !has_lane_assignment(&bitmap) {
        return Ok(None);
    }
    let mut imported = command_import::prepare_lane(&request.root, &request.global_remotes_file)?;
    let id = super::super::lane_context::current_id(&bitmap, &context["scope"])?;
    if imported.load_lane(&id)?.is_none_or(|lane| lane.is_new) {
        return Ok(None);
    }
    imported.prepare_checkout_lane(&request.root, &id, targets)?;
    Ok(Some(imported))
}

fn has_lane_assignment(bitmap: &Value) -> bool {
    bitmap
        .get("_bit_lane")
        .is_some_and(|lane| !lane.is_null())
}
