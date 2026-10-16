//! Inspect lanes in a configured file remote through the repository engine.
use super::{LaneData, Tracking, array, lane, read_current, report_others};
use crate::commands::{
    color::Chalk, engine::Engine, status::cache::cache_root, workspace_command::format::Formatter,
};
use serde_json::{Value, json};
use std::{io, path::Path};

pub(in crate::commands::lane) fn read(
    root: &Path,
    scope: &str,
    merge_data: bool,
) -> io::Result<(Vec<LaneData>, (Value, String))> {
    let current = read_current(root)?;
    let mut engine = Engine::new()?;
    let listed: Value = engine.request(&json!({
        "kind": "laneList", "root": root, "mergeData": merge_data,
        "remoteScope": scope,
        "globalRemotesFile": cache_root().join("config/global-remotes.json"),
    }))?;
    let lanes = array(listed.get("lanes"), "remote lanes")?
        .iter()
        .map(|row| lane(row, &Tracking(Vec::new())))
        .collect::<io::Result<Vec<_>>>()?;
    Ok((lanes, current))
}

pub(super) fn report(lanes: &[LaneData], current: &Value, chalk: Chalk, details: bool) -> String {
    let format = Formatter::new(chalk);
    let others = report_others(lanes, current, chalk, details, &format);
    let hint = if details {
        "use --merged and --not-merged to see which of the lanes is fully merged"
    } else {
        "use 'bit lane list --details' or 'bit lane show <lane-name>' for more info"
    };
    Formatter::join(&[others, format.hint(hint)])
}
