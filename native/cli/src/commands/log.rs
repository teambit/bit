//! Local `bit log`: validated Version history from Rust, with the Node CLI's report and JSON views.
//! Remote history, lanes, missing objects and unusual graph or metadata forms delegate before output.

use super::{
    color::Chalk,
    engine::Engine,
    list::bitmap,
    status::js::{array, decline, text},
    workspace_command::{self, results::Report},
};
use crate::{commands::Command, history::History, native::Outcome, workspace};
use chrono::{DateTime, Local};
use serde_json::{Map, Value, json};
use std::{
    collections::HashSet,
    env,
    ffi::OsString,
    io::{self, Write},
    path::Path,
    process::ExitCode,
};
use unicode_width::UnicodeWidthStr;

pub const COMMAND: Command = Command { name: "log", aliases: &[], run };

#[derive(Default)]
struct Options<'a> {
    id: Option<&'a str>,
    json: bool,
    parents: bool,
    one_line: bool,
    full_hash: bool,
    full_message: bool,
    show_hidden: bool,
}

fn parse<'a>(args: &[&'a str]) -> Option<Options<'a>> {
    let mut options = Options::default();
    for arg in args {
        let field = match *arg {
            "-j" | "--json" => &mut options.json,
            "--parents" => &mut options.parents,
            "-o" | "--one-line" => &mut options.one_line,
            "-f" | "--full-hash" => &mut options.full_hash,
            "-m" | "--full-message" => &mut options.full_message,
            "--show-hidden" => &mut options.show_hidden,
            "-r" | "--remote" => return None,
            id if !id.starts_with('-') && options.id.is_none() => {
                options.id = Some(id);
                continue;
            }
            _ => return None,
        };
        if *field {
            return None;
        }
        *field = true;
    }
    options.id.map(|_| options)
}

fn run(args: &[OsString]) -> io::Result<Outcome> {
    let Some(argv) = workspace_command::utf8_args(args) else {
        return Ok(Outcome::Declined("log arguments are not UTF-8".into()));
    };
    let Some(options) = parse(&argv[1..]) else {
        return Ok(Outcome::Declined("outside the native log grammar".into()));
    };
    let Some(root) = workspace::root(&env::current_dir()?) else {
        return Ok(Outcome::Declined("not inside a workspace".into()));
    };
    let logs = match read(&root, &options) {
        Ok(logs) => logs,
        Err(error) => return Ok(Outcome::Declined(format!("log: {error}"))),
    };
    let chalk = Chalk::detect(args);
    let output = match render(&logs, &options, chalk) {
        Ok(output) => output,
        Err(error) => return Ok(Outcome::Declined(format!("log report: {error}"))),
    };
    if options.json {
        let history = History::start(&root, args);
        let mut stdout = io::stdout().lock();
        stdout.write_all(serde_json::to_string_pretty(&output)?.as_bytes())?;
        stdout.flush()?;
        history.end(true);
        return Ok(Outcome::Exit(ExitCode::SUCCESS));
    }
    let report = Report { data: text(Some(&output))?.to_string(), code: 0, details: None };
    workspace_command::execute_with(&root, args, "log", &report, |_| Ok(()))
}

fn read(root: &Path, options: &Options<'_>) -> io::Result<Vec<Value>> {
    let bitmap = bitmap::read(root)?;
    let id = options.id.ok_or_else(|| decline("log id"))?;
    let id = id.split_once('@').map_or(id, |(name, _)| name);
    let matches: Vec<_> = bitmap.entries
        .iter()
        .filter(|entry| {
            entry.identity == id
                || entry.identity
                    .rsplit_once('/')
                    .is_some_and(|(_, name)| name == id)
        })
        .collect();
    if matches.len() != 1 {
        return Err(decline("log identity absent or ambiguous"));
    }
    let target = matches[0];
    if target.staged_deprecation {
        return Err(decline("staged deprecation changes log metadata"));
    }
    if target.version.is_none() {
        return Ok(Vec::new());
    }
    let mut engine = Engine::new()?;
    let result: Value = engine.request(&json!({
        "kind":"componentLog", "root":root, "identity":target.identity,
        "lane":bitmap.lane,
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
    Ok(logs)
}

fn normalize(row: &Value) -> io::Result<Value> {
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
    for key in ["username", "email"] {
        if normalized
            .get(key)
            .and_then(Value::as_str)
            .is_none_or(str::is_empty)
        {
            normalized.insert(key.into(), json!("unknown"));
        }
    }
    if let Some(tag) = row.get("tag") {
        normalized.insert("tag".into(), tag.clone());
    }
    for key in ["hash", "parents", "onLane", "deleted"] {
        normalized.insert(key.into(), row[key].clone());
    }
    if let Some(hidden) = row.get("hidden") {
        normalized.insert("hidden".into(), hidden.clone());
    }
    Ok(Value::Object(normalized))
}

fn raw_date_order(left: &Value, right: &Value) -> std::cmp::Ordering {
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
    if options.one_line || options.parents {
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
    if row["deleted"] == true || row["deprecated"] == true {
        return Err(decline("log removal or deprecation"));
    }
    let mut output = format!("{}\n", chalk.yellow(&title));
    let username = text(row.get("username"))?;
    let email = text(row.get("email"))?;
    output.push_str(&chalk.white(&format!("author: {username} <{email}>\n")));
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
    if !linear_parents(logs) {
        return Err(decline("log merge or filtered parent graph"));
    }
    let rows = ordered_parents(logs)?;
    rows.iter()
        .map(|row| {
            let parents = array(row.get("parents"), "log parents")?;
            let parents = if parents.is_empty() {
                "<N/A>".to_string()
            } else {
                format!("Parent(s): {}", text(parents.first())?)
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

fn ordered_parents(logs: &[Value]) -> io::Result<Vec<&Value>> {
    let parents: HashSet<&str> = logs
        .iter()
        .filter_map(|row| row["parents"].as_array())
        .flatten()
        .filter_map(Value::as_str)
        .collect();
    let mut heads = logs
        .iter()
        .filter(|row| {
            row["hash"]
                .as_str()
                .is_some_and(|hash| !parents.contains(hash))
        });
    let mut current = heads.next();
    if heads.next().is_some() || (current.is_none() && !logs.is_empty()) {
        return Err(decline("log disconnected parent graph"));
    }
    let mut rows = Vec::with_capacity(logs.len());
    while let Some(row) = current {
        rows.push(row);
        current = row["parents"]
            .as_array()
            .and_then(|parents| parents.first())
            .and_then(Value::as_str)
            .and_then(|parent| {
                logs.iter()
                    .find(|row| row["hash"] == parent)
            });
        if rows.len() > logs.len() {
            return Err(decline("log cyclic parent graph"));
        }
    }
    if rows.len() != logs.len() {
        return Err(decline("log disconnected parent graph"));
    }
    Ok(rows)
}

fn linear_parents(rows: &[Value]) -> bool {
    let visible: HashSet<&str> = rows
        .iter()
        .filter_map(|row| row["hash"].as_str())
        .collect();
    rows.iter()
        .all(|row| {
            let Some(parents) = row["parents"].as_array() else { return false };
            parents.len() <= 1 && parents.iter().all(|parent| covered_parent(parent, &visible))
        })
}

fn covered_parent(parent: &Value, visible: &HashSet<&str>) -> bool {
    parent
        .as_str()
        .is_some_and(|parent| visible.contains(parent))
}

fn one_line(logs: &[Value]) -> io::Result<String> {
    let fields = ["hash", "tag", "username", "date", "message"];
    let rows: Vec<Vec<&str>> = logs
        .iter()
        .map(|row| {
            fields
                .iter()
                .map(|field| row[*field].as_str().unwrap_or_default())
                .collect()
        })
        .collect();
    let widths: Vec<usize> = (0..fields.len())
        .map(|index| {
            rows.iter()
                .map(|row| UnicodeWidthStr::width(row[index]))
                .max()
                .unwrap_or(0)
        })
        .collect();
    let lines: Vec<String> = rows
        .iter()
        .map(|row| {
            row.iter()
                .enumerate()
                .map(|(index, field)| {
                    let padding =
                        " ".repeat(widths[index].saturating_sub(UnicodeWidthStr::width(*field)));
                    if index + 1 == fields.len() {
                        format!("{field}{padding}")
                    } else {
                        format!("{field}{padding} ")
                    }
                })
                .collect::<String>()
        })
        .collect();
    Ok(lines.join("\n"))
}

#[cfg(test)]
mod log_tests;
