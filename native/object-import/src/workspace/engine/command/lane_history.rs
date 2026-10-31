//! Retain one refreshed history selection across complete checkout/install phases.
pub(super) mod context;
pub(super) mod heads;
pub(in crate::workspace::engine) mod inspection;
pub(super) mod planning;
pub(super) mod progress;
pub(in crate::workspace::engine) use prepare::run;
mod prepare;
mod selection;
#[cfg(test)]
mod tests;
use super::{State, input, invalid, proof};
use crate::command_import::lane;
use serde::Deserialize;
use serde_json::{Value, json};
use std::{io, path::PathBuf};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(in crate::workspace::engine) struct Prepare {
    root: PathBuf,
    home: PathBuf,
    global_remotes_file: PathBuf,
    id: String,
    #[serde(flatten)]
    flags: Flags,
    #[serde(flatten)]
    transport: super::inbound::Transport,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Flags {
    #[serde(default)]
    revert: bool,
    #[serde(default)]
    restore_deleted: bool,
}
#[derive(Clone)]
pub(super) struct Phase {
    pub(super) versions: Vec<(String, String)>,
    pub(super) revert: bool,
}
pub(super) struct Retained {
    root: PathBuf,
    token: String,
    lane_id: lane::Id,
    lane_hash: String,
    phases: Vec<Phase>,
    next: usize,
    proofs: Vec<proof::Proof>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Options {
    token: String,
    phase: usize,
    #[serde(skip)]
    pub(super) resolved: Option<Phase>,
}

pub(super) fn resolve(request: &mut input::Prepare, state: &State) -> io::Result<()> {
    let Some(options) = &request.options.scope.lane_history else { return Ok(()) };
    let retained =
        state.histories.checkout.as_ref().ok_or_else(|| invalid("history owner absent"))?;
    if options.phase != retained.next {
        return Err(invalid("history phase order changed"));
    }
    let token = options.token.trim();
    if token.is_empty()
        || request.root != retained.root
        || token != retained.token.trim()
    {
        return Err(invalid("history phase owner changed"));
    }
    let phase =
        retained.phases.get(retained.next).ok_or_else(|| invalid("history phases exhausted"))?;
    if request.operation != input::Operation::Checkout || request.options.revert != phase.revert {
        return Err(invalid("history phase options changed"));
    }
    proof::verify(&retained.proofs)?;
    validate_lane(request, retained)?;
    request.options.scope.lane_history
        .as_mut()
        .ok_or_else(|| invalid("lane history options"))?
        .resolved = Some(phase.clone());
    Ok(())
}
fn validate_lane(request: &input::Prepare, retained: &Retained) -> io::Result<()> {
    let mut imported =
        crate::command_import::prepare_cached(&request.root, &request.global_remotes_file)?;
    let bitmap = super::super::client_status::config::document(&request.root.join(".bitmap"))?;
    let current = super::lane_context::current_id(&bitmap, &imported.lane_scope()?)?;
    if current != retained.lane_id
        || imported
            .load_lane(&current)?
            .is_none_or(|lane| lane.hash.trim() != retained.lane_hash.trim())
    {
        return Err(invalid("history current lane changed"));
    }
    Ok(())
}
pub(super) fn extend_proofs(
    request: &input::Prepare,
    state: &State,
    proofs: &mut Vec<proof::Proof>,
) -> io::Result<()> {
    if request.options.scope.lane_history.is_some() {
        let retained =
            state.histories.checkout.as_ref().ok_or_else(|| invalid("history owner absent"))?;
        proofs.extend(retained.proofs.iter().cloned());
    }
    Ok(())
}

pub(super) fn phase(options: &input::Options) -> Option<&Phase> {
    options.scope.lane_history.as_ref()?.resolved.as_ref()
}

pub(super) fn applied(
    state: &mut State,
    request: &input::Prepare,
    receipt: &Value,
) -> io::Result<()> {
    let Some(options) = &request.options.scope.lane_history else { return Ok(()) };
    let retained =
        state.histories.checkout.as_mut().ok_or_else(|| invalid("history owner absent"))?;
    if retained.next != options.phase {
        return Err(invalid("history apply phase order changed"));
    }
    let token = options.token.trim();
    if token.is_empty() || request.root != retained.root || retained.token.trim() != token {
        return Err(invalid("history apply owner changed"));
    }
    selection::accept_bitmap(&mut retained.proofs, receipt)?;
    retained.next += 1;
    if retained.next == retained.phases.len() {
        state.histories.checkout = None;
    }
    Ok(())
}

impl Phase {
    fn receipt(&self, index: usize) -> Value {
        json!({"phase":index,"ids":self.versions.iter().map(|(id,_)|id).collect::<Vec<_>>(),
            "versionPerId":self.versions.iter().map(|(id,version)|format!("{id}@{version}")).collect::<Vec<_>>(),"revert":self.revert})
    }
}
