//! Native `bit lane show` for a local lane or main.

use super::list::{LaneData, components_report, read};
use crate::{
    commands::{
        color::Chalk,
        status::js::{decline, text},
        workspace_command::{self, format::Formatter, results::Report},
    },
    history::History,
    native::Outcome,
    workspace,
};
use serde_json::Value;
use std::{
    env,
    ffi::OsString,
    io::{self, Write},
    path::Path,
    process::ExitCode,
};

/// `LaneShowCmd` for a local lane or main. Remote reads still use Node.
pub(super) fn show(args: &[OsString], lane_args: &[&str]) -> io::Result<Outcome> {
    let Some((name, json)) = parse(lane_args) else {
        return Ok(Outcome::Declined("lane show flags outside the native grammar".into()));
    };
    let Some(root) = workspace::root(&env::current_dir()?) else {
        return Ok(Outcome::Declined("not inside a workspace".into()));
    };
    let (lanes, (current, _)) = match read(&root) {
        Ok(data) => data,
        Err(error) => return Ok(Outcome::Declined(format!("lane show: {error}"))),
    };
    let target = name.unwrap_or_else(|| current["name"].as_str().unwrap_or("main"));
    let Some(lane) = find(&lanes, target) else {
        return Ok(Outcome::Declined("lane show name is absent or ambiguous".into()));
    };
    if json {
        return emit_json(&root, args, lane);
    }
    let report = Report { data: show_report(lane, Chalk::detect(args))?, code: 0, details: None };
    workspace_command::execute_with(&root, args, "show", &report, |_| Ok(()))
}

fn parse<'a>(args: &[&'a str]) -> Option<(Option<&'a str>, bool)> {
    let mut json = false;
    let mut name = None;
    for arg in args {
        match *arg {
            "--json" | "-j" if !json => json = true,
            value if !value.starts_with('-') && name.is_none() => name = Some(value),
            _ => return None,
        }
    }
    Some((name, json))
}

pub(super) fn find<'a>(lanes: &'a [LaneData], target: &str) -> Option<&'a LaneData> {
    let matches: Vec<_> = lanes
        .iter()
        .filter(|lane| {
            lane.id["name"] == target
                || lane.label() == target
                || (!lane.is_main() && lane.alias.as_deref() == Some(target))
        })
        .collect();
    (matches.len() == 1).then(|| matches[0])
}

fn emit_json(root: &Path, args: &[OsString], lane: &LaneData) -> io::Result<Outcome> {
    let history = History::start(root, args);
    let mut stdout = io::stdout().lock();
    stdout.write_all(serde_json::to_string_pretty(&lane.json())?.as_bytes())?;
    stdout.flush()?;
    history.end(true);
    Ok(Outcome::Exit(ExitCode::SUCCESS))
}

pub(super) fn show_report(lane: &LaneData, chalk: Chalk) -> io::Result<String> {
    let format = Formatter::new(chalk);
    let name = lane.id["name"].as_str().unwrap_or_default();
    let id = if lane.is_main() {
        "main".to_string()
    } else {
        format!("{}/{name}", text(lane.id.get("scope"))?)
    };
    Ok(Formatter::join(&[format.title(&id), metadata(lane)?, components_report(lane, &format)]))
}

fn metadata(lane: &LaneData) -> io::Result<String> {
    let name = text(lane.id.get("name"))?;
    let mut meta = Vec::new();
    if let Some((log, _)) = &lane.lane {
        if !log.is_null() {
            let author = log["username"]
                .as_str()
                .filter(|value| !value.is_empty())
                .unwrap_or("N/A");
            let email = log["email"]
                .as_str()
                .filter(|value| !value.is_empty())
                .unwrap_or("N/A");
            meta.push(format!("author: {author} <{email}>"));
            if let Some(created) = created(log)? {
                meta.push(created);
            }
        }
        let scope = text(lane.id.get("scope"))?;
        meta.push(format!("link: https://bit.cloud/{}/~lane/{name}", scope.replacen('.', "/", 1)));
    }
    Ok(meta.join("\n"))
}

fn created(log: &Value) -> io::Result<Option<String>> {
    let Some(date) = log["date"]
        .as_str()
        .filter(|value| !value.is_empty())
    else {
        return Ok(None);
    };
    let millis: i64 = date.parse().map_err(|_| decline("lane log date"))?;
    let at = chrono::DateTime::from_timestamp_millis(millis)
        .ok_or_else(|| decline("lane log date"))?
        .with_timezone(&chrono::Local);
    Ok(Some(format!("created: {}", at.format("%-m/%-d/%Y, %-I:%M:%S %p"))))
}
