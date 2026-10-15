//! The source CLI's `getFileLog` selection and `log-file` report.

use super::read;
use crate::{
    commands::{
        Command,
        color::Chalk,
        diff::files,
        log,
        status::js::{decline, text},
        workspace_command::{self, results::Report},
    },
    native::Outcome,
    workspace,
};
use serde_json::Value;
use std::{env, ffi::OsString, io, path::Path};

pub(super) const COMMAND: Command = Command { name: "log-file", aliases: &[], run };

fn run(args: &[OsString]) -> io::Result<Outcome> {
    if cfg!(windows) {
        return Ok(Outcome::Declined("log-file Windows output is not qualified".into()));
    }
    let Some(argv) = workspace_command::utf8_args(args) else {
        return Ok(Outcome::Declined("log-file arguments are not UTF-8".into()));
    };
    let (path, one_line) = match argv.as_slice() {
        [_, path] => (*path, false),
        [_, path, "-o" | "--one-line"] => (*path, true),
        _ => return Ok(Outcome::Declined("outside native log-file grammar".into())),
    };
    let Some(root) = workspace::root(&env::current_dir()?) else {
        return Ok(Outcome::Declined("not inside a workspace".into()));
    };
    let result = read(&root, path)
        .and_then(|(file, rows)| {
            if one_line { compact(&rows) } else { report(&rows, &file, Chalk::detect(args)) }
        });
    let data = match result {
        Ok(data) => data,
        Err(error) => return Ok(Outcome::Declined(format!("log-file: {error}"))),
    };
    let report = Report { data, code: 0, details: None };
    workspace_command::execute_with(&root, args, "log-file", &report, |_| Ok(()))
}

fn compact(rows: &[Value]) -> io::Result<String> {
    let selected = selected(rows)?;
    let cells: Vec<Vec<&str>> = selected
        .iter()
        .map(|row| {
            let entry = &row["normalized"];
            ["hash", "tag", "username", "date", "message"]
                .iter()
                .map(|key| entry[*key].as_str().unwrap_or_default())
                .chain(std::iter::once(row["fileHash"].as_str().unwrap_or("<REMOVED>")))
                .collect()
        })
        .collect();
    Ok(log::table(&cells))
}

struct Previous<'a> {
    row: Option<&'a Value>,
    contents: Option<&'a str>,
}

fn report(rows: &[Value], file: &str, chalk: Chalk) -> io::Result<String> {
    let selected = selected(rows)?;
    let mut previous = Previous { row: None, contents: None };
    selected
        .iter()
        .map(|row| {
            let output = one(row, file, chalk, &previous)?;
            if let Some(contents) = row["contents"].as_str() {
                previous.contents = Some(contents);
            }
            previous.row = Some(row);
            Ok(output)
        })
        .collect::<io::Result<Vec<_>>>()
        .map(|reports| reports.join("\n"))
}

fn one(row: &Value, file: &str, chalk: Chalk, previous: &Previous<'_>) -> io::Result<String> {
    let mut output = heading(&row["normalized"], chalk)?;
    let body = patch(row, file, chalk, previous)?;
    output.push_str(
        &body
            .split('\n')
            .map(|line| format!("      {line}"))
            .collect::<Vec<_>>()
            .join("\n"),
    );
    Ok(output)
}

fn heading(entry: &Value, chalk: Chalk) -> io::Result<String> {
    let title = match entry["tag"].as_str() {
        Some(tag) => format!("tag {tag} ({})\n", text(entry.get("hash"))?),
        None => format!("snap {}\n", text(entry.get("hash"))?),
    };
    let mut output = chalk.yellow(&title);
    let username = text(entry.get("username"))?;
    let email = text(entry.get("email"))?;
    output.push_str(&chalk.white(&format!("author: {username} <{email}>\n")));
    if let Some(date) = entry["date"].as_str() {
        output.push_str(&chalk.white(&format!("date: {date}\n")));
    }
    let message = text(entry.get("message"))?;
    if message.is_empty() {
        output.push('\n');
    } else {
        output.push_str(&chalk.white(&format!("message: {message}\n\n")));
    }
    Ok(output)
}

fn patch(row: &Value, file: &str, chalk: Chalk, previous: &Previous<'_>) -> io::Result<String> {
    let (Some(before), Some(after), Some(last)) =
        (previous.contents, row["contents"].as_str(), previous.row)
    else {
        return Ok(chalk.green("<FILE-ADDED>"));
    };
    let raw = files::diff_texts(before, after)?;
    let name = Path::new(file)
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| decline("log-file name"))?;
    Ok(files::format(
        &raw,
        text(row["normalized"].get("hash"))?,
        text(last["normalized"].get("hash"))?,
        name,
    ))
}

fn selected(rows: &[Value]) -> io::Result<Vec<&Value>> {
    let mut output = Vec::new();
    let mut last_hash: Option<&str> = None;
    for row in rows {
        if row["log"]["hidden"] == true {
            continue;
        }
        let hash = row["fileHash"].as_str().unwrap_or("<REMOVED>");
        if hash == "<REMOVED>" && last_hash.is_none() || Some(hash) == last_hash {
            continue;
        }
        output.push(row);
        last_hash = Some(hash);
    }
    Ok(output)
}
