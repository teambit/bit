//! Retain the published `lane history` remote refresh until report validation.
use super::super::{State, inbound, invalid, lane_context};
use crate::{
    command_import::{self, lane},
    lane_history,
};
use serde::Deserialize;
use serde_json::{Value, json};
use std::{io, path::PathBuf};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(in crate::workspace::engine) struct Prepare {
    root: PathBuf,
    home: PathBuf,
    global_remotes_file: PathBuf,
    #[serde(default)]
    bare_scope: bool,
    #[serde(default)]
    remote_host: Option<String>,
    #[serde(default)]
    lane: Option<String>,
    #[serde(flatten)]
    transport: inbound::Transport,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(in crate::workspace::engine) struct Apply {
    token: String,
}

pub(in crate::workspace::engine::command) struct Retained {
    token: String,
    import: command_import::PreparedImport,
}

pub(in crate::workspace::engine) fn prepare(
    request: &Prepare,
    state: &mut State,
) -> io::Result<(usize, Value)> {
    if state.record.is_some()
        || state.histories.checkout.is_some()
        || state.histories.inspection.is_some()
    {
        return Err(invalid("lane history owner active"));
    }
    for path in [&request.root, &request.home, &request.global_remotes_file] {
        super::super::super::path(path)?;
    }
    let mut import = if request.bare_scope {
        command_import::prepare_lane_at(&request.root, &request.global_remotes_file)?
    } else {
        command_import::prepare_lane(&request.root, &request.global_remotes_file)?
    };
    let id = selection(request, &mut import)?;
    if let Some(host) = &request.remote_host {
        import.remote_host(&id.scope, host)?;
    }
    let lane = import.load_lane(&id)?.ok_or_else(|| invalid("lane history local Lane absent"))?;
    if lane.is_new {
        let history = local_history(request, &lane.hash)?;
        return Ok((0, json!({"history":history,"needsApply":false})));
    }
    let history = refresh(request, &mut import, &id, &lane)?;
    state.sequence =
        state.sequence.checked_add(1).ok_or_else(|| invalid("lane history sequence limit"))?;
    let token = format!("lane-history-inspection-{}", state.sequence);
    state.histories.inspection = Some(Box::new(Retained { token: token.clone(), import }));
    Ok((1, json!({"token":token,"history":history,"needsApply":true})))
}

fn refresh(
    request: &Prepare,
    import: &mut command_import::PreparedImport,
    id: &lane::Id,
    lane: &lane::Record,
) -> io::Result<Value> {
    let hash = if let Some((remote, hash)) = inbound::remote::history_remote_at(
        &request.root,
        &request.home,
        &request.transport,
        id,
        request.bare_scope,
        request.remote_host.as_deref(),
    )? {
        import.virtual_remote(&remote.scope, remote.path, &remote.objects)?;
        Some(hash)
    } else {
        None
    };
    import.refresh_lane_history(lane, id, hash.as_deref())?;
    let history = import.overlay
        .read(&lane_history::hash(&lane.hash), "LaneHistory")?
        .cloned()
        .map_or_else(|| local_history(request, &lane.hash), Ok)?;
    validate_history(&history, &lane.hash)?;
    Ok(history)
}

fn selection(
    request: &Prepare,
    import: &mut command_import::PreparedImport,
) -> io::Result<lane::Id> {
    let id = if let Some(name) = &request.lane {
        import.resolve_lane(name)?
    } else {
        if request.bare_scope {
            return Err(invalid("bare lane history needs a lane name"));
        }
        let bitmap =
            super::super::super::client_status::config::document(&request.root.join(".bitmap"))?;
        lane_context::current_id(&bitmap, &import.lane_scope()?)?
    };
    if id.is_main() {
        return Err(invalid("lane history main has no history"));
    }
    Ok(id)
}

fn local_history(request: &Prepare, hash: &str) -> io::Result<Value> {
    let history = if request.bare_scope {
        lane_history::read_at(&request.root, hash)
    } else {
        lane_history::read(&request.root, hash)
    };
    match history {
        Ok(value) => Ok(value),
        Err(error) if error.kind() == io::ErrorKind::NotFound => {
            Ok(json!({"laneHash":hash,"history":{}}))
        }
        Err(error) => Err(error),
    }
}

fn validate_history(value: &Value, hash: &str) -> io::Result<()> {
    if value["laneHash"] != hash {
        return Err(invalid("lane history identity"));
    }
    let rows = value["history"]
        .as_object()
        .filter(|rows| rows.len() <= 4096)
        .ok_or_else(|| invalid("lane history entries"))?;
    for (id, row) in rows {
        if id.is_empty()
            || !row["log"].is_object()
            || row["log"]["date"]
                .as_str()
                .and_then(|text| text.parse::<i64>().ok())
                .is_none()
            || !row["components"].is_array()
        {
            return Err(invalid("lane history entry"));
        }
    }
    Ok(())
}

pub(in crate::workspace::engine) fn apply(
    request: &Apply,
    state: &mut State,
) -> io::Result<(usize, Value)> {
    let retained =
        state.histories.inspection.as_ref().ok_or_else(|| invalid("lane history owner absent"))?;
    if retained.token != request.token {
        return Err(invalid("lane history owner changed"));
    }
    let mut retained = state.histories.inspection.take().unwrap();
    retained.import.commit_retained()?;
    Ok((1, json!({"applied":true})))
}
