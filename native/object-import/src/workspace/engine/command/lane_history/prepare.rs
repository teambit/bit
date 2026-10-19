mod retain;
use super::{Prepare, State, invalid, selection};
use crate::{
    command_import,
    workspace::engine::{client_status::config, response},
};
use serde_json::{Value, json};
use std::io;

pub(in crate::workspace::engine) fn run(
    input: Prepare,
    state: &mut State,
) -> io::Result<(usize, Value)> {
    if state.record.is_some() || state.lane_history.is_some() {
        return Err(invalid("history owner active"));
    }
    for path in [&input.root, &input.home, &input.global_remotes_file] {
        super::super::super::path(path)?;
    }
    let mut imported = command_import::prepare_lane(&input.root, &input.global_remotes_file)?;
    let bitmap = config::document(&input.root.join(".bitmap"))?;
    let lane_id = super::super::lane_context::current_id(&bitmap, &imported.lane_scope()?)?;
    if lane_id.is_main() {
        return Err(response::canonical(format!(
            r#"unable to checkout history "{}" while on main"#,
            input.id,
        )));
    }
    let lane =
        imported.load_lane(&lane_id)?.ok_or_else(|| invalid("history current Lane absent"))?;
    let committed = refresh(&input, &mut imported, &lane_id, &lane)?;
    let result = select(input, state, lane_id, lane.hash, &bitmap, committed);
    if committed { result.map_err(owned) } else { result }
}
fn select(
    input: Prepare,
    state: &mut State,
    lane_id: command_import::lane::Id,
    lane_hash: String,
    bitmap: &Value,
    committed: bool,
) -> io::Result<(usize, Value)> {
    let history = read(&input.root, &lane_hash)?;
    let item = history["history"]
        .get(&input.id)
        .ok_or_else(|| {
            response::with_progress(
                response::canonical(format!(
                    r#"unable to find history "{}" in lane "{}/{}""#,
                    input.id, lane_id.scope, lane_id.name,
                )),
                json!({"imports":[]}),
            )
        })?;
    let settings = config::configuration_for_command(&input.root, true)?;
    let phases = selection::phases(
        item,
        bitmap,
        &settings,
        input.flags.revert,
        input.flags.restore_deleted,
    )?;
    let (count, mut output) = retain::run(input, state, lane_id, lane_hash, phases)?;
    output["committed"] = json!(committed);
    Ok((count, output))
}
fn read(root: &std::path::Path, hash: &str) -> io::Result<Value> {
    match crate::lane_history::read(root, hash) {
        Ok(history) => Ok(history),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(json!({"history":{}})),
        Err(error) => Err(error),
    }
}
fn refresh(
    input: &Prepare,
    imported: &mut command_import::PreparedImport,
    id: &command_import::lane::Id,
    lane: &command_import::lane::Record,
) -> io::Result<bool> {
    if lane.is_new {
        return Ok(false);
    }
    let hash = if let Some((remote, hash)) = super::super::inbound::remote::history_remote(
        &input.root,
        &input.home,
        &input.transport,
        id,
    )? {
        imported.virtual_remote(&remote.scope, remote.path, &remote.objects)?;
        Some(hash)
    } else {
        None
    };
    imported.refresh_lane_history(lane, id, hash.as_deref())?;
    imported.commit_retained().map_err(owned)?;
    Ok(true)
}
fn owned(error: io::Error) -> io::Error {
    if response::is_canonical(&error) {
        error
    } else {
        response::with_progress(response::canonical(error.to_string()), json!({"imports":[]}))
    }
}
