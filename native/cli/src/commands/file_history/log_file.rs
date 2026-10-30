//! The source CLI's `getFileLog` selection and `log-file` report.

use super::{Target, classify_target, read};
use crate::{
    commands::{
        Command,
        color::Chalk,
        diff::files,
        installation::Installer,
        log,
        status::js::{decline, text},
        workspace_command::{self, results::Report},
    },
    discovery::{self, Target as CliTarget},
    host::Host,
    native::Outcome,
    workspace,
};
use serde_json::{Value, json};
use std::{
    env,
    ffi::OsString,
    io::{self, Write},
    path::Path,
};

pub(super) const COMMAND: Command = Command { name: "log-file", aliases: &[], run };

fn parse_args<'a>(args: &[&'a str]) -> Option<(&'a str, bool)> {
    let mut path = None;
    let mut one_line = false;
    for &arg in args {
        match arg {
            "--no-color" => {}
            "-o" | "--one-line" | "--one-line=true" => one_line = true,
            "--one-line=false" => one_line = false,
            val if !val.starts_with('-') && !val.is_empty() && path.is_none() => path = Some(val),
            _ => return None,
        }
    }
    Some((path?, one_line))
}

fn run(args: &[OsString]) -> io::Result<Outcome> {
    let Some(argv) = workspace_command::utf8_args(args) else {
        return Ok(Outcome::Declined("log-file arguments are not UTF-8".into()));
    };
    let Some((path, one_line)) = parse_args(&argv[1..]) else {
        return Ok(Outcome::Declined("outside native log-file grammar".into()));
    };
    let cwd = env::current_dir()?;
    let Some(root) = workspace::root(&cwd) else {
        if env::var_os("CI").is_some_and(|val| !val.is_empty()) {
            return Ok(Outcome::Declined("not inside a workspace".into()));
        }
        return workspace_command::execute_failure_scope(
            &cwd,
            args,
            "log-file",
            false,
            "",
            io::Error::other(log::OUTSIDE_WORKSPACE_ERR),
        );
    };
    run_in_workspace(&root, args, path, one_line)
}

fn run_in_workspace(
    root: &Path,
    args: &[OsString],
    path: &str,
    one_line: bool,
) -> io::Result<Outcome> {
    if env::var_os("CI").is_none_or(|val| val.is_empty()) {
        match classify_target(root, path) {
            Ok(Target::Unowned) => {
                let err = format!("unable to find component for file {path}");
                return workspace_command::execute_then(root, args, "log-file", move |_| {
                    Err(io::Error::other(err))
                });
            }
            Ok(Target::Unversioned) => {
                let report = Report { data: String::new(), code: 0, details: None };
                return workspace_command::execute_with(
                    root,
                    args,
                    "log-file",
                    &report,
                    |_| Ok(()),
                );
            }
            _ => {}
        }
    }
    if Installer::needs_canonical(root) {
        return Ok(Outcome::Declined("log-file custom component loader".into()));
    }
    let (identity, versions, report) = match prepare(root, path, one_line, args) {
        Ok(result) => result,
        Err(error) => return Ok(Outcome::Declined(format!("log-file: {error}"))),
    };
    published_loader(root, args, path, &identity, &versions, &report)
}

fn prepare(
    root: &Path,
    path: &str,
    one_line: bool,
    args: &[OsString],
) -> io::Result<(String, Vec<String>, Report)> {
    let (identity, file, rows) = read(root, path)?;
    let data = if one_line { compact(&rows) } else { report(&rows, &file, Chalk::detect(args)) }?;
    let versions = historical_versions(&rows)?;
    Ok((identity, versions, Report { data, code: 0, details: None }))
}

fn published_loader(
    root: &Path,
    args: &[OsString],
    path: &str,
    identity: &str,
    versions: &[String],
    report: &Report,
) -> io::Result<Outcome> {
    let CliTarget::Entry(cli) = discovery::find()? else {
        return Ok(Outcome::Declined("log-file requires an installed published loader".into()));
    };
    let host = Host::new(cli, root.to_owned(), Chalk::detect(args).enabled());
    workspace_command::execute_with(root, args, "log-file", report, |_| {
        let loaded = host.call(
            "logFileLoad",
            &json!({
                "filePath":path,"identity":identity,"versions":versions,
            }),
        );
        io::stdout()
            .lock()
            .write_all(host.take_stdout().as_bytes())?;
        loaded.map(|_| ())
    })
}

fn historical_versions(rows: &[Value]) -> io::Result<Vec<String>> {
    rows.iter()
        .filter(|row| row["log"]["hidden"] != true)
        .map(|row| {
            row["log"]["tag"]
                .as_str()
                .or_else(|| row["log"]["hash"].as_str())
                .map(str::to_string)
                .ok_or_else(|| decline("log-file historical version"))
        })
        .collect()
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
