//! Local `bit lane history` backed by the native `LaneHistory` object reader.
use super::{list, show};
use crate::{
    commands::workspace_command::{self, results::Report},
    history::History,
    native::Outcome,
    workspace,
};
use bit_object_import::lane_history;
use serde_json::{Map, Value};
use std::{
    env,
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
    let Some(root) = workspace::root(&env::current_dir()?) else {
        return Ok(Outcome::Declined("not inside a workspace".into()));
    };
    let selected = match select(&root, &options) {
        Ok(value) => value,
        Err(error) => return Ok(Outcome::Declined(format!("lane history: {error}"))),
    };
    if options.json {
        return emit_json(&root, args, &selected, options.id.is_some());
    }
    let report =
        Report { data: text_rows(&selected, options.id.is_some())?, code: 0, details: None };
    workspace_command::execute_with(&root, args, "history", &report, |_| Ok(()))
}

fn select(root: &Path, options: &Options<'_>) -> io::Result<Vec<(String, Value)>> {
    let (lanes, (current, _)) = list::read(root)?;
    let target = options.lane.unwrap_or_else(|| current["name"].as_str().unwrap_or("main"));
    let lane = show::find(&lanes, target)
        .filter(|lane| !lane.is_main())
        .ok_or_else(invalid)?;
    let (_, lane_hash) = lane.lane.as_ref().ok_or_else(invalid)?;
    let value = lane_history::read(root, lane_hash)?;
    let rows = sorted(&value)?;
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

fn emit_json(
    root: &Path,
    args: &[OsString],
    rows: &[(String, Value)],
    single: bool,
) -> io::Result<Outcome> {
    let output = if single {
        json_row(&rows[0].0, &rows[0].1)?
    } else {
        Value::Array(
            rows.iter()
                .map(|(id, row)| json_row(id, row))
                .collect::<io::Result<_>>()?,
        )
    };
    let history = History::start(root, args);
    let mut stdout = io::stdout().lock();
    stdout.write_all(serde_json::to_string_pretty(&output)?.as_bytes())?;
    stdout.flush()?;
    history.end(true);
    Ok(Outcome::Exit(ExitCode::SUCCESS))
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
