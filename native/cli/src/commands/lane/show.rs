//! Native `bit lane show` for a local lane or main.

use super::list::{
    LaneData, components_report, project_http, read_for_scope,
    remote::{http_at, read_at},
};
use crate::{
    commands::{
        color::Chalk,
        remote_resolution::Session,
        status::js::{decline, text},
        workspace_command::{self, format::Formatter, results::Report},
    },
    history::History,
    native::Outcome,
};
use serde_json::Value;
use std::{
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
    let scope_root = match super::scope_root::discover() {
        Ok(Some(scope_root)) => scope_root,
        Ok(None) => return Ok(Outcome::Declined("not inside a scope".into())),
        Err(error) => return Ok(Outcome::Declined(format!("lane show scope: {error}"))),
    };
    let root = scope_root.path;
    let mut session =
        if scope_root.bare { Session::new(None, args) } else { Session::new(Some(&root), args) };
    if remote && name.is_none() {
        if std::env::var_os("CI").is_some_and(|val| !val.is_empty()) {
            return Ok(Outcome::Declined("CI lane show remote without name delegated".into()));
        }
        return owned_failure(
            &root,
            scope_root.bare,
            args,
            json,
            &session,
            io::Error::other("remote flag is not supported without lane name"),
        );
    }
    let lane = match select_or_exit(&root, scope_root.bare, args, json, name, remote, &mut session)?
    {
        Ok(lane) => lane,
        Err(outcome) => return Ok(outcome),
    };
    io::stdout()
        .lock()
        .write_all(session.output().as_bytes())?;
    emit_selected(&root, scope_root.bare, args, json, lane)
}

fn emit_selected(
    root: &Path,
    bare: bool,
    args: &[OsString],
    json: bool,
    lane: Selected,
) -> io::Result<Outcome> {
    if json {
        return match &lane {
            Selected::File(lane) => emit_json(root, bare, args, &lane.json()),
            Selected::Http(row) => emit_json(root, bare, args, row),
        };
    }
    let lane = match lane {
        Selected::File(lane) => lane,
        Selected::Http(row) => Box::new(project_http(&row)?),
    };
    let report = Report { data: show_report(&lane, Chalk::detect(args))?, code: 0, details: None };
    if bare {
        workspace_command::execute_with_scope(root, args, "show", &report)
    } else {
        workspace_command::execute_with(root, args, "show", &report, |_| Ok(()))
    }
}

fn select_or_exit(
    root: &Path,
    bare: bool,
    args: &[OsString],
    json: bool,
    name: Option<&str>,
    remote: bool,
    session: &mut Session,
) -> io::Result<Result<Selected, Outcome>> {
    match select_lane(root, bare, name, remote, session) {
        Ok(Some(lane)) => Ok(Ok(lane)),
        Ok(None) if session.owned() => {
            let field = if json { "components" } else { "id" };
            let error = io::Error::other(format!(
                "Cannot read properties of undefined (reading '{field}')",
            ));
            Ok(Err(owned_failure(root, bare, args, json, session, error)?))
        }
        Ok(None) => Ok(Err(Outcome::Declined("lane show name is absent or ambiguous".into()))),
        Err(error) if session.owned() => {
            Ok(Err(owned_failure(root, bare, args, json, session, error)?))
        }
        Err(error) => Ok(Err(Outcome::Declined(format!("lane show: {error}")))),
    }
}

fn owned_failure(
    root: &Path,
    bare: bool,
    args: &[OsString],
    json: bool,
    session: &Session,
    error: io::Error,
) -> io::Result<Outcome> {
    let callback_output = session.output();
    if bare {
        workspace_command::execute_failure_scope(root, args, "show", json, callback_output, error)
    } else if json {
        workspace_command::execute_json(root, args, "show", |_| {
            io::stdout().lock().write_all(callback_output.as_bytes())?;
            Err(error)
        })
    } else {
        workspace_command::execute_then(root, args, "show", |_| {
            io::stdout().lock().write_all(callback_output.as_bytes())?;
            Err(error)
        })
    }
}

enum Selected {
    File(Box<LaneData>),
    Http(Value),
}

fn select_lane(
    root: &Path,
    bare: bool,
    name: Option<&str>,
    remote: bool,
    session: &mut Session,
) -> io::Result<Option<Selected>> {
    let (local, (current, _)) = read_for_scope(root, bare, false)?;
    let target = name.unwrap_or_else(|| current["name"].as_str().unwrap_or("main"));
    if !remote {
        return Ok(find(&local, target)
            .cloned()
            .map(Box::new)
            .map(Selected::File));
    }
    let scope = remote_scope(&local, target)?;
    session.resolve(std::slice::from_ref(&scope))?;
    let host = session
        .overrides()
        .get(&scope)
        .map(String::as_str);
    if let Ok((lanes, _)) = read_at(root, bare, &scope, false, host) {
        return find(&lanes, target)
            .cloned()
            .map(Box::new)
            .map(Selected::File)
            .map(Some)
            .ok_or_else(|| missing(target));
    }
    let name = target.rsplit_once('/').map_or(target, |(_, name)| name);
    let rows = http_at(root, bare, &scope, Some(name), host)?;
    let lane = rows
        .into_iter()
        .find(|row| {
            row["id"]["name"] == target
                || format!("{scope}/{}", row["id"]["name"].as_str().unwrap_or_default()) == target
        });
    lane.map(Selected::Http)
        .map(Some)
        .ok_or_else(|| missing(target))
}

fn remote_scope(local: &[LaneData], target: &str) -> io::Result<String> {
    let scope = target
        .split_once('/')
        .map(|(scope, _)| scope.to_owned())
        .or_else(|| {
            find(local, target)
                .and_then(|lane| lane.id["scope"].as_str())
                .map(str::to_owned)
        });
    scope.ok_or_else(|| io::Error::other("remote lane identity"))
}

fn missing(target: &str) -> io::Error {
    io::Error::other(format!(r#"lane "{target}" was not found"#))
}

fn parse<'a>(args: &[&'a str]) -> Option<(Option<&'a str>, bool, bool)> {
    let mut json = false;
    let mut remote = false;
    let mut name = None;
    for arg in args {
        match *arg {
            "--no-color" => {}
            "--json" | "-j" | "--json=true" => json = true,
            "--json=false" => json = false,
            "--remote" | "-r" | "--remote=true" => remote = true,
            "--remote=false" => remote = false,
            "-jr" | "-rj" => {
                json = true;
                remote = true;
            }
            value if !value.starts_with('-') && name.is_none() => name = Some(value),
            _ => return None,
        }
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

fn emit_json(root: &Path, bare: bool, args: &[OsString], lane: &Value) -> io::Result<Outcome> {
    let history = (!bare).then(|| History::start(root, args));
    let mut stdout = io::stdout().lock();
    stdout.write_all(serde_json::to_string_pretty(lane)?.as_bytes())?;
    stdout.flush()?;
    if let Some(history) = history {
        history.end(true);
    }
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
