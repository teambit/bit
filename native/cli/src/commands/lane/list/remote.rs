//! Inspect lanes in configured file and HTTP remotes through the repository engine.
use super::{LaneData, Tracking, array, lane, read_current, report_others};
use crate::{
    commands::{
        color::Chalk,
        engine::Engine,
        status::cache::cache_root,
        workspace_command::{self, NodeCli, format::Formatter, results::Report},
    },
    history::History,
    native::Outcome,
};
use serde_json::{Value, json};
use std::{
    ffi::OsString,
    io::{self, Write},
    path::Path,
    process::ExitCode,
};

pub(super) fn run(
    root: &Path,
    args: &[OsString],
    scope: &str,
    json: bool,
    details: bool,
    merged: Option<bool>,
) -> io::Result<Outcome> {
    let (lanes, current, raw) = match read(root, scope, merged.is_some()) {
        Ok((lanes, current)) => (lanes, current, None),
        Err(_) => match http(root, scope, None) {
            Ok(raw) => {
                let current = read_current(root)?;
                let lanes = raw
                    .iter()
                    .map(project)
                    .collect::<io::Result<Vec<_>>>()?;
                (lanes, current, Some(raw))
            }
            Err(error) => return Ok(Outcome::Declined(format!("lane list remote: {error}"))),
        },
    };
    if json {
        return match raw {
            Some(raw) => emit_http_json(root, args, &raw, &current.1),
            None => super::emit_json(root, args, &lanes, &current.1),
        };
    }
    let text = match merged {
        Some(merged) if raw.is_some() => {
            report_http_merged(raw.as_deref().unwrap(), merged, Chalk::detect(args))
        }
        Some(merged) => super::merged::report(&lanes, merged, Chalk::detect(args)),
        None => report(&lanes, &current.0, Chalk::detect(args), details),
    };
    workspace_command::execute_with(
        root,
        args,
        "list",
        &Report { data: text, code: 0, details: None },
        |_| Ok(()),
    )
}

fn report_http_merged(lanes: &[Value], merged: bool, chalk: Chalk) -> String {
    let format = Formatter::new(chalk);
    if merged {
        return format.hint("none of the lanes is merged");
    }
    if lanes.is_empty() {
        return format.hint("all lanes are merged");
    }
    let items = lanes
        .iter()
        .map(|_| format.item("undefined"))
        .collect::<Vec<_>>();
    format.section("unmerged lanes", "", &items)
}

pub(in crate::commands::lane) fn http(
    root: &Path,
    scope: &str,
    name: Option<&str>,
) -> io::Result<Vec<Value>> {
    let cli = NodeCli::find()?;
    let config = cache_root().join("config");
    let mut engine = Engine::new()?;
    let listed: Value = engine.request(&json!({
        "kind":"httpLaneList", "root":root, "remoteScope":scope,
        "name":name,
        "globalRemotesFile":config.join("global-remotes.json"),
        "globalConfigDir":config, "bitVersion":cli.version,
    }))?;
    Ok(array(listed.get("lanes"), "HTTP lanes")?.to_vec())
}

pub(in crate::commands::lane) fn project(row: &Value) -> io::Result<LaneData> {
    let id = row
        .get("id")
        .ok_or_else(|| io::Error::other("HTTP lane id"))?
        .clone();
    let components = array(row.get("components"), "HTTP lane components")?.to_vec();
    let main = id["name"] == "main";
    Ok(LaneData {
        id,
        alias: None,
        components,
        update_dependents: None,
        readme_component: None,
        is_merged: None,
        lane: (!main).then(|| (Value::Null, String::new())),
    })
}

fn emit_http_json(
    root: &Path,
    args: &[OsString],
    lanes: &[Value],
    current: &str,
) -> io::Result<Outcome> {
    let history = History::start(root, args);
    let data = json!({"lanes":lanes,"currentLane":current});
    let mut stdout = io::stdout().lock();
    stdout.write_all(serde_json::to_string_pretty(&data)?.as_bytes())?;
    stdout.flush()?;
    history.end(true);
    Ok(Outcome::Exit(ExitCode::SUCCESS))
}

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
