//! Inspect lanes in configured file and HTTP remotes through the repository engine.
use super::{LaneData, Tracking, array, lane, read_current, report_others};
use crate::{
    commands::{
        color::Chalk,
        engine::Engine,
        remote_resolution::Session,
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
    bare: bool,
    args: &[OsString],
    scope: &str,
    json: bool,
    details: bool,
    merged: Option<bool>,
) -> io::Result<Outcome> {
    // Published LanesMain has no workspace consumer in a bare scope, so
    // getRemoteByName resolves against global remotes only.
    let mut session = if bare { Session::new(None, args) } else { Session::new(Some(root), args) };
    let (lanes, current, raw) = match prepare(root, bare, scope, merged, &mut session) {
        Ok(value) => value,
        Err(error) if session.owned() => return Err(error),
        Err(error) => return Ok(Outcome::Declined(format!("lane list remote: {error}"))),
    };
    io::stdout()
        .lock()
        .write_all(session.output().as_bytes())?;
    if json {
        return match raw {
            Some(raw) => emit_http_json(root, bare, args, &raw, &current.1),
            None => super::emit_json(root, bare, args, &lanes, &current.1),
        };
    }
    let text = text_report(&lanes, &current.0, raw.as_deref(), merged, details, args);
    let report = Report { data: text, code: 0, details: None };
    if bare {
        workspace_command::execute_with_scope(root, args, "list", &report)
    } else {
        workspace_command::execute_with(root, args, "list", &report, |_| Ok(()))
    }
}

fn text_report(
    lanes: &[LaneData],
    current: &Value,
    raw: Option<&[Value]>,
    merged: Option<bool>,
    details: bool,
    args: &[OsString],
) -> String {
    match merged {
        Some(merged) if raw.is_some() => {
            report_http_merged(raw.unwrap(), merged, Chalk::detect(args))
        }
        Some(merged) => super::merged::report(lanes, merged, Chalk::detect(args)),
        None => report(lanes, current, Chalk::detect(args), details),
    }
}

type Prepared = (Vec<LaneData>, (Value, String), Option<Vec<Value>>);

fn prepare(
    root: &Path,
    bare: bool,
    scope: &str,
    merged: Option<bool>,
    session: &mut Session,
) -> io::Result<Prepared> {
    session.resolve(&[scope.to_owned()])?;
    let host = session
        .overrides()
        .get(scope)
        .map(String::as_str);
    if let Ok((lanes, current)) = read_at(root, bare, scope, merged.is_some(), host) {
        return Ok((lanes, current, None));
    }
    let raw = http_at(root, bare, scope, None, host)?;
    let current = current(root, bare)?;
    let lanes = raw
        .iter()
        .map(project)
        .collect::<io::Result<Vec<_>>>()?;
    Ok((lanes, current, Some(raw)))
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

pub(in crate::commands::lane) fn http_at(
    root: &Path,
    bare: bool,
    scope: &str,
    name: Option<&str>,
    host: Option<&str>,
) -> io::Result<Vec<Value>> {
    let cli = NodeCli::find()?;
    let config = cache_root().join("config");
    let mut engine = Engine::new()?;
    let listed: Value = engine.request(&json!({
        "kind":"httpLaneList", "root":root, "remoteScope":scope,
        "bareScope":bare, "remoteHost":host,
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
    bare: bool,
    args: &[OsString],
    lanes: &[Value],
    current: &str,
) -> io::Result<Outcome> {
    let history = (!bare).then(|| History::start(root, args));
    let data = json!({"lanes":lanes,"currentLane":current});
    let mut stdout = io::stdout().lock();
    stdout.write_all(serde_json::to_string_pretty(&data)?.as_bytes())?;
    stdout.flush()?;
    if let Some(history) = history {
        history.end(true);
    }
    Ok(Outcome::Exit(ExitCode::SUCCESS))
}

pub(in crate::commands::lane) fn read_at(
    root: &Path,
    bare: bool,
    scope: &str,
    merge_data: bool,
    host: Option<&str>,
) -> io::Result<(Vec<LaneData>, (Value, String))> {
    let current = current(root, bare)?;
    let mut engine = Engine::new()?;
    let listed: Value = engine.request(&json!({
        "kind": "laneList", "root": root, "mergeData": merge_data,
        "bareScope":bare, "remoteHost":host,
        "remoteScope": scope,
        "globalRemotesFile": cache_root().join("config/global-remotes.json"),
    }))?;
    let lanes = array(listed.get("lanes"), "remote lanes")?
        .iter()
        .map(|row| lane(row, &Tracking(Vec::new())))
        .collect::<io::Result<Vec<_>>>()?;
    Ok((lanes, current))
}

pub(in crate::commands::lane) fn current(root: &Path, bare: bool) -> io::Result<(Value, String)> {
    if bare {
        let scope: Value = serde_json::from_slice(&std::fs::read(root.join("scope.json"))?)?;
        Ok((json!({"name":"main","scope":scope["name"]}), "main".to_owned()))
    } else {
        read_current(root)
    }
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
