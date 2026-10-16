//! Native `bit lane show` for a local lane or main.

use super::list::{LaneData, components_report, project_http, read, read_http, read_remote};
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

/// `LaneShowCmd` for a local lane, main, or a configured file remote.
pub(super) fn show(args: &[OsString], lane_args: &[&str]) -> io::Result<Outcome> {
    let Some((name, json, remote)) = parse(lane_args) else {
        return Ok(Outcome::Declined("lane show flags outside the native grammar".into()));
    };
    let Some(root) = workspace::root(&env::current_dir()?) else {
        return Ok(Outcome::Declined("not inside a workspace".into()));
    };
    let lane = match select_lane(&root, name, remote) {
        Ok(lane) => lane,
        Err(error) => return Ok(Outcome::Declined(format!("lane show: {error}"))),
    };
    let Some(lane) = lane else {
        return Ok(Outcome::Declined("lane show name is absent or ambiguous".into()));
    };
    if json {
        return match &lane {
            Selected::File(lane) => emit_json(&root, args, &lane.json()),
            Selected::Http(row) => emit_json(&root, args, row),
        };
    }
    let lane = match lane {
        Selected::File(lane) => lane,
        Selected::Http(row) => Box::new(project_http(&row)?),
    };
    let report = Report { data: show_report(&lane, Chalk::detect(args))?, code: 0, details: None };
    workspace_command::execute_with(&root, args, "show", &report, |_| Ok(()))
}

enum Selected {
    File(Box<LaneData>),
    Http(Value),
}

fn select_lane(root: &Path, name: Option<&str>, remote: bool) -> io::Result<Option<Selected>> {
    let (local, (current, _)) = read(root)?;
    let target = name.unwrap_or_else(|| current["name"].as_str().unwrap_or("main"));
    if !remote {
        return Ok(find(&local, target)
            .cloned()
            .map(Box::new)
            .map(Selected::File));
    }
    let scope = target
        .split_once('/')
        .map(|(scope, _)| scope.to_owned())
        .or_else(|| {
            find(&local, target)
                .and_then(|lane| lane.id["scope"].as_str())
                .map(str::to_owned)
        });
    let scope = scope.ok_or_else(|| io::Error::other("remote lane identity"))?;
    if let Ok((lanes, _)) = read_remote(root, &scope, false) {
        return Ok(find(&lanes, target)
            .cloned()
            .map(Box::new)
            .map(Selected::File));
    }
    let name = target.rsplit_once('/').map_or(target, |(_, name)| name);
    let rows = read_http(root, &scope, Some(name))?;
    let lane = rows
        .into_iter()
        .find(|row| {
            row["id"]["name"] == target
                || format!("{scope}/{}", row["id"]["name"].as_str().unwrap_or_default()) == target
        });
    Ok(lane.map(Selected::Http))
}

fn parse<'a>(args: &[&'a str]) -> Option<(Option<&'a str>, bool, bool)> {
    let mut json = false;
    let mut remote = false;
    let mut name = None;
    for arg in args {
        match *arg {
            "--json" | "-j" if !json => json = true,
            "--remote" | "-r" if !remote => remote = true,
            value if !value.starts_with('-') && name.is_none() => name = Some(value),
            _ => return None,
        }
    }
    if remote && name.is_none() {
        return None;
    }
    Some((name, json, remote))
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

fn emit_json(root: &Path, args: &[OsString], lane: &Value) -> io::Result<Outcome> {
    let history = History::start(root, args);
    let mut stdout = io::stdout().lock();
    stdout.write_all(serde_json::to_string_pretty(lane)?.as_bytes())?;
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
