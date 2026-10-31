//! `bit log`: validated local Version history and HTTP remote history in Rust,
//! with the Node CLI's report and JSON views. Missing objects and unusual
//! graph or metadata forms delegate before output.

pub(super) use table::{table, table_with_separator};

#[cfg(test)]
mod log_tests;
mod options;
mod table;
mod topology;

use super::{
    color::Chalk,
    engine::Engine,
    lint_cmd::emit_pattern_error,
    list::bitmap,
    status::{
        cache::cache_root,
        js::{array, decline, text},
    },
    workspace_command::{self, NodeCli, results::Report},
};
use crate::{commands::Command, history::History, native::Outcome, workspace};
use chrono::{DateTime, Local};
use options::{Options, parse};
use serde_json::{Map, Value, json};
use std::{
    env,
    ffi::OsString,
    io::{self, Write},
    path::Path,
    process::ExitCode,
};
use table::one_line;
use topology::{LocalTarget, ordered_parents, resolve_local_target};

pub const COMMAND: Command = Command { name: "log", aliases: &[], run };

pub(super) const OUTSIDE_WORKSPACE_ERR: &str = "This command can only be run inside a bit workspace. Please check that you are inside a bit workspace and then re-run (to initialize a new workspace please use bit init)";

fn run(args: &[OsString]) -> io::Result<Outcome> {
    let Some(argv) = workspace_command::utf8_args(args) else {
        return Ok(Outcome::Declined("log arguments are not UTF-8".into()));
    };
    let Some(options) = parse(&argv[1..]) else {
        return Ok(Outcome::Declined("outside the native log grammar".into()));
    };
    let cwd = env::current_dir()?;
    let root = workspace::root(&cwd);
    if root.is_none() && !options.remote {
        if env::var_os("CI").is_some_and(|val| !val.is_empty()) {
            return Ok(Outcome::Declined("not inside a workspace".into()));
        }
        return workspace_command::execute_failure_scope(
            &cwd,
            args,
            "log",
            options.json,
            "",
            io::Error::other(OUTSIDE_WORKSPACE_ERR),
        );
    }
    execute_log(args, root.as_deref(), &options)
}

fn execute_log(
    args: &[OsString],
    root: Option<&Path>,
    options: &Options<'_>,
) -> io::Result<Outcome> {
    let chalk = Chalk::detect(args);
    let logs = match if options.remote {
        read_remote(root, options)
    } else {
        match read(root.unwrap(), options, chalk) {
            Ok(Ok(logs)) => Ok(logs),
            Ok(Err(err)) => {
                return emit_pattern_error(root.unwrap(), args, "log", options.json, err);
            }
            Err(error) => Err(error),
        }
    } {
        Ok(logs) => logs,
        Err(error) => return Ok(Outcome::Declined(format!("log: {error}"))),
    };
    let output = match render(&logs, options, chalk) {
        Ok(output) => output,
        Err(error) => return Ok(Outcome::Declined(format!("log report: {error}"))),
    };
    emit(args, root, &output, options)
}

fn emit(
    args: &[OsString],
    root: Option<&Path>,
    output: &Value,
    options: &Options<'_>,
) -> io::Result<Outcome> {
    if options.json {
        let history = root.map(|root| History::start(root, args));
        let mut stdout = io::stdout().lock();
        stdout.write_all(serde_json::to_string_pretty(&output)?.as_bytes())?;
        stdout.flush()?;
        if let Some(history) = history {
            history.end(true);
        }
        return Ok(Outcome::Exit(ExitCode::SUCCESS));
    }
    let report = Report { data: text(Some(output))?.to_string(), code: 0, details: None };
    if let Some(root) = root {
        workspace_command::execute_with(root, args, "log", &report, |_| Ok(()))
    } else {
        writeln!(io::stdout().lock(), "{}", report.data)?;
        Ok(Outcome::Exit(ExitCode::SUCCESS))
    }
}

fn read_remote(root: Option<&Path>, options: &Options<'_>) -> io::Result<Vec<Value>> {
    let id = options.id.ok_or_else(|| decline("remote log id"))?;
    let cli = NodeCli::find()?;
    let response: Value = Engine::new()?
        .request(&json!({
            "kind": "remoteComponentLog",
            "root": root,
            "identity": id,
            "globalConfigDir": cache_root().join("config"),
            "nodeExecutable": cli.node,
            "bitDir": cli.bit_dir,
            "bitVersion": cli.version,
        }))?;
    if options.parents && response["parentsAvailable"] != true {
        return Err(decline("remote HTTP history has no parents"));
    }
    Ok(array(response.get("logs"), "remote component logs")?.to_vec())
}

fn read(
    root: &Path,
    options: &Options<'_>,
    chalk: Chalk,
) -> io::Result<Result<Vec<Value>, String>> {
    super::status::autosync::run_if_enabled(root)?;
    let bitmap = bitmap::read(root)?;
    let raw_id = options.id.ok_or_else(|| decline("log id"))?;
    let (identity, deprecation) = match resolve_local_target(root, &bitmap, raw_id, chalk)? {
        LocalTarget::NewComponent => return Ok(Ok(Vec::new())),
        LocalTarget::UserError(err) => return Ok(Err(err)),
        LocalTarget::Versioned { identity, deprecation } => (identity, deprecation),
    };
    let mut engine = Engine::new()?;
    let result: Value = engine.request(&json!({
        "kind":"componentLog", "root":root, "identity":identity,
        "lane":bitmap.lane,"deprecation":deprecation,
    }))?;
    let rows = array(result.get("versions"), "component log versions")?;
    let mut raw = rows.to_vec();
    raw.sort_by(raw_date_order);
    let mut logs = raw
        .iter()
        .map(normalize)
        .collect::<io::Result<Vec<_>>>()?;
    if !options.show_hidden {
        logs.retain(|row| row["hidden"] != true);
    }
    Ok(Ok(logs))
}

pub(super) fn normalize(row: &Value) -> io::Result<Value> {
    let raw = row["log"].as_object().ok_or_else(|| decline("component log metadata"))?;
    let mut normalized = Map::new();
    for (key, value) in raw {
        if key != "date" {
            normalized.insert(key.clone(), value.clone());
        } else if let Some(date) = value
            .as_str()
            .filter(|date| !date.is_empty())
        {
            let millis: i64 = date.parse().map_err(|_| decline("component log date"))?;
            let date = DateTime::from_timestamp_millis(millis)
                .ok_or_else(|| decline("component log date"))?
                .with_timezone(&Local);
            normalized.insert("date".into(), json!(date.format("%Y-%m-%d %H:%M:%S").to_string()));
        }
    }
    normalize_author(&mut normalized);
    for key in ["hash", "parents", "onLane", "deleted"] {
        normalized.insert(key.into(), row[key].clone());
    }
    for key in ["tag", "deprecated", "hidden"] {
        if let Some(val) = row.get(key) {
            normalized.insert(key.into(), val.clone());
        }
    }
    Ok(Value::Object(normalized))
}

fn normalize_author(normalized: &mut Map<String, Value>) {
    for key in ["username", "email"] {
        if normalized
            .get(key)
            .and_then(Value::as_str)
            .is_none_or(str::is_empty)
        {
            normalized.insert(key.into(), json!("unknown"));
        }
    }
}

pub(super) fn raw_date_order(left: &Value, right: &Value) -> std::cmp::Ordering {
    let millis = |row: &Value| {
        row["log"]["date"]
            .as_str()
            .and_then(|date| date.parse::<i64>().ok())
    };
    match (millis(left), millis(right)) {
        (Some(left), Some(right)) => left.cmp(&right),
        _ => std::cmp::Ordering::Equal,
    }
}

fn render(logs: &[Value], options: &Options<'_>, chalk: Chalk) -> io::Result<Value> {
    let mut logs = logs.to_vec();
    if !options.remote && (options.one_line || options.parents) {
        shorten(&mut logs, options)?;
    }
    if options.parents {
        let rows = parents_report(&logs, chalk)?;
        return Ok(if options.json { json!(rows) } else { json!(rows.join("\n")) });
    }
    if options.json {
        return Ok(json!(logs));
    }
    logs.reverse();
    if options.one_line {
        return Ok(json!(one_line(&logs)?));
    }
    Ok(json!(
        logs.iter()
            .map(|row| paint(row, chalk))
            .collect::<io::Result<Vec<_>>>()?
            .join("\n")
    ))
}

fn shorten(logs: &mut [Value], options: &Options<'_>) -> io::Result<()> {
    for row in logs {
        if !options.full_hash {
            shorten_hashes(row)?;
        }
        if !options.full_message {
            row["message"] = json!(
                text(row.get("message"))?
                    .lines()
                    .next()
                    .unwrap_or_default()
            );
        }
    }
    Ok(())
}

fn shorten_hashes(row: &mut Value) -> io::Result<()> {
    let hash = text(row.get("hash"))?;
    row["hash"] = json!(&hash[..hash.len().min(9)]);
    let parents = array(row.get("parents"), "log parents")?;
    row["parents"] = json!(
        parents
            .iter()
            .map(|parent| parent
                .as_str()
                .map(|parent| &parent[..parent.len().min(9)]))
            .collect::<Option<Vec<_>>>()
            .ok_or_else(|| decline("log parents"))?
    );
    Ok(())
}

fn paint(row: &Value, chalk: Chalk) -> io::Result<String> {
    let title = match row.get("tag").and_then(Value::as_str) {
        Some(tag) => format!("tag {tag} ({})", text(row.get("hash"))?),
        None => format!("snap {}", text(row.get("hash"))?),
    };
    let suffix = if row["deleted"] == true {
        format!(" {}", chalk.red(&format!("{} deleted", chalk.red("✖"))))
    } else if row["deprecated"] == true {
        format!(" {}", chalk.yellow(&format!("{} deprecated", chalk.yellow("⚠"))))
    } else {
        String::new()
    };
    let mut output = format!("{}{suffix}\n", chalk.yellow(&title));
    let username = row
        .get("username")
        .and_then(Value::as_str)
        .filter(|username| !username.is_empty());
    let email = row
        .get("email")
        .and_then(Value::as_str)
        .filter(|email| !email.is_empty());
    let author = match (username, email) {
        (Some(username), Some(email)) => Some(format!("author: {username} <{email}>\n")),
        (Some(username), None) => Some(format!("author: {username}\n")),
        (None, Some(email)) => Some(format!("author: <{email}>\n")),
        (None, None) => None,
    };
    if let Some(author) = author {
        output.push_str(&chalk.white(&author));
    }
    if let Some(date) = row.get("date").and_then(Value::as_str) {
        output.push_str(&chalk.white(&format!("date: {date}\n")));
    }
    let message = text(row.get("message"))?;
    if !message.is_empty() {
        output.push_str(&chalk.white(&format!("\n      {message}\n")));
    }
    Ok(output)
}

fn parents_report(logs: &[Value], chalk: Chalk) -> io::Result<Vec<String>> {
    let rows = ordered_parents(logs)?;
    rows.iter()
        .map(|row| {
            let parents = array(row.get("parents"), "log parents")?;
            let parents = if parents.is_empty() {
                "<N/A>".to_string()
            } else {
                format!(
                    "Parent(s): {}",
                    parents
                        .iter()
                        .map(|parent| text(Some(parent)))
                        .collect::<io::Result<Vec<_>>>()?
                        .join(", "),
                )
            };
            Ok(format!(
                "{} {} {} {}, {parents}",
                chalk.yellow(text(row.get("hash"))?),
                text(row.get("username"))?,
                row["date"].as_str().unwrap_or_default(),
                text(row.get("message"))?,
            ))
        })
        .collect()
}
