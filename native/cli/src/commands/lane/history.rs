//! Local `bit lane history` backed by the native `LaneHistory` object reader.
use crate::{
    commands::{
        engine::Engine,
        remote_resolution::Session,
        status::cache::cache_root,
        workspace_command::{self, NodeCli, results::Report},
    },
    history::History,
    native::Outcome,
};
use serde_json::{Map, Value, json};
use std::{
    ffi::OsString,
    io::{self, Write},
    path::Path,
    process::ExitCode,
};

struct Options<'a> {
    lane: Option<&'a str>,
    id: Option<&'a str>,
    json: bool,
}

fn parse<'a>(args: &'a [&'a str]) -> Option<Options<'a>> {
    let mut options = Options { lane: None, id: None, json: false };
    let mut args = args.iter().copied();
    while let Some(arg) = args.next() {
        match arg {
            "--json" | "-j" if !options.json => options.json = true,
            "--id" if options.id.is_none() => options.id = Some(args.next()?),
            value if !value.starts_with('-') && options.lane.is_none() => {
                options.lane = Some(value);
            }
            _ => return None,
        }
    }
    Some(options)
}

pub(super) fn run(args: &[OsString], lane_args: &[&str]) -> io::Result<Outcome> {
    let Some(options) = parse(lane_args) else {
        return Ok(Outcome::Declined("lane history flags outside the native grammar".into()));
    };
    let scope_root = match super::scope_root::discover() {
        Ok(Some(scope_root)) => scope_root,
        Ok(None) => return Ok(Outcome::Declined("not inside a scope".into())),
        Err(error) => return Ok(Outcome::Declined(format!("lane history scope: {error}"))),
    };
    let root = scope_root.path;
    let mut session = scope_root.bare.then(|| Session::for_scope(&root, args));
    let host = if let Some(session) = &mut session {
        match resolve_bare_remote(&root, options.lane, session) {
            Ok(host) => host,
            Err(error) if session.owned() => return Err(error),
            Err(error) => return Ok(Outcome::Declined(format!("lane history: {error}"))),
        }
    } else {
        None
    };
    let mut engine = Engine::new()?;
    let prepared = match inspect(&root, scope_root.bare, host.as_deref(), &options, &mut engine) {
        Ok(value) => value,
        Err(error) if session.as_ref().is_some_and(Session::owned) => {
            return Err(error);
        }
        Err(error) => return Ok(Outcome::Declined(format!("lane history: {error}"))),
    };
    finish(&root, scope_root.bare, args, &options, session.as_ref(), &mut engine, &prepared)
}

fn finish(
    root: &Path,
    bare: bool,
    args: &[OsString],
    options: &Options<'_>,
    session: Option<&Session>,
    engine: &mut Engine,
    prepared: &Value,
) -> io::Result<Outcome> {
    let selected = match select(&prepared["history"], options) {
        Ok(value) => value,
        Err(error) if session.is_some_and(Session::owned) => return Err(error),
        Err(error) => return Ok(Outcome::Declined(format!("lane history: {error}"))),
    };
    let json_output =
        options.json.then(|| json_rows(&selected, options.id.is_some())).transpose()?;
    let report =
        if options.json { None } else { Some(text_rows(&selected, options.id.is_some())?) };
    apply_refresh(engine, prepared)?;
    if let Some(session) = session {
        io::stdout()
            .lock()
            .write_all(session.output().as_bytes())?;
    }
    if options.json {
        return emit_json(root, bare, args, json_output.as_ref().ok_or_else(invalid)?);
    }
    let report = Report { data: report.ok_or_else(invalid)?, code: 0, details: None };
    if bare {
        workspace_command::execute_with_scope(root, args, "history", &report)
    } else {
        workspace_command::execute_with(root, args, "history", &report, |_| Ok(()))
    }
}

fn apply_refresh(engine: &mut Engine, prepared: &Value) -> io::Result<()> {
    if prepared["needsApply"] != true {
        return Ok(());
    }
    let token = prepared["token"].as_str().ok_or_else(invalid)?;
    let receipt: Value = engine.request(&json!({
        "kind":"commandLaneHistoryInspectApply", "token":token,
    }))?;
    if receipt["applied"] != true {
        return Err(invalid());
    }
    Ok(())
}

fn resolve_bare_remote(
    root: &Path,
    lane: Option<&str>,
    session: &mut Session,
) -> io::Result<Option<String>> {
    let Some(lane) = lane else { return Ok(None) };
    let scope: Value = serde_json::from_slice(&std::fs::read(root.join("scope.json"))?)?;
    let local = scope["name"].as_str().ok_or_else(invalid)?;
    let (remote, name) = lane
        .split_once('/')
        .unwrap_or((local, lane));
    if scope["lanes"]["new"]
        .as_array()
        .is_some_and(|rows| rows.iter().any(|row| row == name))
    {
        return Ok(None);
    }
    session.resolve(&[remote.to_owned()])?;
    Ok(session.overrides().get(remote).cloned())
}

fn inspect(
    root: &Path,
    bare: bool,
    host: Option<&str>,
    options: &Options<'_>,
    engine: &mut Engine,
) -> io::Result<Value> {
    let cli = NodeCli::find()?;
    let config = cache_root().join("config");
    engine.request(&json!({
        "kind":"commandLaneHistoryInspectPrepare", "root":root,
        "home":workspace_command::home(),
        "globalRemotesFile":config.join("global-remotes.json"),
        "globalConfigDir":config, "nodeExecutable":cli.node,
        "bitDir":cli.bit_dir, "bitVersion":cli.version,
        "lane":options.lane, "bareScope":bare, "remoteHost":host,
    }))
}

fn select(value: &Value, options: &Options<'_>) -> io::Result<Vec<(String, Value)>> {
    let rows = sorted(value)?;
    if let Some(id) = options.id {
        let (_, row) = rows
            .iter()
            .find(|(key, _)| *key == id)
            .ok_or_else(invalid)?;
        return Ok(vec![(id.into(), (*row).clone())]);
    }
    Ok(rows
        .into_iter()
        .map(|(id, row)| (id.into(), row.clone()))
        .collect())
}

fn emit_json(root: &Path, bare: bool, args: &[OsString], output: &Value) -> io::Result<Outcome> {
    let history = (!bare).then(|| History::start(root, args));
    let mut stdout = io::stdout().lock();
    stdout.write_all(serde_json::to_string_pretty(output)?.as_bytes())?;
    stdout.flush()?;
    if let Some(history) = history {
        history.end(true);
    }
    Ok(Outcome::Exit(ExitCode::SUCCESS))
}

fn json_rows(rows: &[(String, Value)], single: bool) -> io::Result<Value> {
    let output = if single {
        json_row(&rows[0].0, &rows[0].1)?
    } else {
        Value::Array(
            rows.iter()
                .map(|(id, row)| json_row(id, row))
                .collect::<io::Result<_>>()?,
        )
    };
    Ok(output)
}

fn sorted(value: &Value) -> io::Result<Vec<(&str, &Value)>> {
    let history = value["history"].as_object().ok_or_else(invalid)?;
    let mut rows: Vec<_> = history
        .iter()
        .map(|(key, value)| (key.as_str(), value))
        .collect();
    rows.sort_by_key(|(_, row)| {
        row["log"]["date"]
            .as_str()
            .and_then(|date| date.parse::<i64>().ok())
    });
    Ok(rows)
}

fn json_row(id: &str, row: &Value) -> io::Result<Value> {
    let mut result = Map::new();
    result.insert("id".into(), Value::String(id.into()));
    for key in ["date", "username", "message"] {
        if let Some(value) = row["log"].get(key) {
            result.insert(key.into(), value.clone());
        }
    }
    result.insert("components".into(), row["components"].clone());
    if row["updateDependents"]
        .as_array()
        .is_some_and(|items| !items.is_empty())
    {
        result.insert("updateDependents".into(), row["updateDependents"].clone());
    }
    Ok(Value::Object(result))
}

fn text_rows(rows: &[(String, Value)], single: bool) -> io::Result<String> {
    rows.iter()
        .map(|(id, row)| text_row(id, row, single))
        .collect::<io::Result<Vec<_>>>()
        .map(|lines| lines.join("\n"))
}

fn text_row(id: &str, row: &Value, single: bool) -> io::Result<String> {
    let date = row["log"]["date"].as_str().ok_or_else(invalid)?;
    let millis: i64 = date.parse().map_err(|_| invalid())?;
    let date = chrono::DateTime::from_timestamp_millis(millis)
        .ok_or_else(invalid)?
        .with_timezone(&chrono::Local)
        .format("%-m/%-d/%Y, %-I:%M:%S %p")
        .to_string();
    let username = row["log"]["username"].as_str().unwrap_or("undefined");
    let message = row["log"]["message"].as_str().unwrap_or("undefined");
    let mut line = format!("{id} {date} {username} {message}");
    if single {
        line.push_str(&text_details(row)?);
    }
    Ok(line)
}

fn text_details(row: &Value) -> io::Result<String> {
    let components = row["components"].as_array().ok_or_else(invalid)?;
    let mut detail = format!("\n\n{}", join_strings(components));
    if let Some(dependents) = row["updateDependents"]
        .as_array()
        .filter(|items| !items.is_empty())
    {
        detail.push_str("\n\nupdateDependents:\n");
        detail.push_str(&join_strings(dependents));
    }
    Ok(detail)
}

fn join_strings(values: &[Value]) -> String {
    values
        .iter()
        .map(|entry| entry.as_str().unwrap_or(""))
        .collect::<Vec<_>>()
        .join("\n")
}

fn invalid() -> io::Error {
    io::Error::new(io::ErrorKind::InvalidData, "unsupported lane history")
}
