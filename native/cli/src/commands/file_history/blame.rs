//! Source-file line attribution from validated local Version history.

#[cfg(test)]
mod tests;

use super::{Target, classify_target, read};
use crate::{
    commands::{
        Command,
        color::Chalk,
        log,
        status::js::{decline, text},
        workspace_command::{self, results::Report},
    },
    native::Outcome,
    workspace,
};
use serde_json::Value;
use std::{collections::HashMap, env, ffi::OsString, io, path::Path};

pub(super) const COMMAND: Command = Command { name: "blame", aliases: &[], run };

pub(super) fn parse_args<'a>(args: &[&'a str]) -> Option<(&'a str, bool)> {
    let mut path = None;
    let mut include_message = false;
    let mut iter = args.iter().copied();
    while let Some(arg) = iter.next() {
        match arg {
            "--" => {
                consume_trailing_path(iter, &mut path)?;
                break;
            }
            "--no-color" | "--no-color=true" | "--no-color=false" => {}
            "-m" | "--include-message" | "--include-message=true" => include_message = true,
            "--include-message=false" => include_message = false,
            val if !val.starts_with('-') && !val.trim().is_empty() && path.is_none() => {
                path = Some(val.trim());
            }
            _ => return None,
        }
    }
    Some((path?, include_message))
}

fn consume_trailing_path<'a>(
    iter: impl Iterator<Item = &'a str>,
    path: &mut Option<&'a str>,
) -> Option<()> {
    for rest in iter {
        let trimmed = rest.trim();
        if trimmed.is_empty() || trimmed.starts_with('-') || path.is_some() {
            return None;
        }
        *path = Some(trimmed);
    }
    Some(())
}

fn run(args: &[OsString]) -> io::Result<Outcome> {
    let Some(argv) = workspace_command::utf8_args(args) else {
        return Ok(Outcome::Declined("blame arguments are not UTF-8".into()));
    };
    let Some((path, include_message)) = parse_args(&argv[1..]) else {
        return Ok(Outcome::Declined("outside native blame grammar".into()));
    };
    let cwd = env::current_dir()?;
    let Some(root) = workspace::root(&cwd) else {
        if env::var_os("CI").is_some_and(|val| !val.is_empty()) {
            return Ok(Outcome::Declined("not inside a workspace".into()));
        }
        return workspace_command::execute_failure_scope(
            &cwd,
            args,
            "blame",
            false,
            "",
            io::Error::other(log::OUTSIDE_WORKSPACE_ERR),
        );
    };
    run_in_workspace(&root, args, path, include_message)
}

fn run_in_workspace(
    root: &Path,
    args: &[OsString],
    path: &str,
    include_message: bool,
) -> io::Result<Outcome> {
    let chalk = Chalk::detect(args);
    if env::var_os("CI").is_none_or(|val| val.is_empty())
        && matches!(classify_target(root, path), Ok(Target::Unowned | Target::Unversioned))
    {
        let report = Report { data: chalk.yellow("no results found"), code: 0, details: None };
        return workspace_command::execute_with(root, args, "blame", &report, |_| Ok(()));
    }
    let data = match read(root, path)
        .and_then(|(_, file, rows)| {
            if published_file_matches(root, path, &file)? {
                report(&rows, include_message, chalk)
            } else {
                Ok(chalk.yellow("no results found"))
            }
        }) {
        Ok(data) => data,
        Err(error) => return Ok(Outcome::Declined(format!("blame: {error}"))),
    };
    let report = Report { data, code: 0, details: None };
    workspace_command::execute_with(root, args, "blame", &report, |_| Ok(()))
}

fn published_file_matches(root: &Path, input: &str, file: &str) -> io::Result<bool> {
    let normalized = input.trim().replace('\\', "/");
    let requested = normalized.strip_prefix("./").unwrap_or(&normalized);
    let component_dir = requested
        .strip_suffix(file)
        .and_then(|prefix| prefix.strip_suffix('/'))
        .ok_or_else(|| decline("blame component path"))?;
    let raw_dir = root
        .join(component_dir)
        .to_string_lossy()
        .to_string();
    let raw_dir = if cfg!(windows) { raw_dir.replace('/', r"\") } else { raw_dir };
    let absolute = root
        .join(requested)
        .to_string_lossy()
        .replace('\\', "/");
    // Published ComponentLogMain.getFileHistoryHashes normalizes only the
    // absolute file path, then removes an unnormalized componentDir prefix.
    // Windows path.join uses backslashes, so the replace leaves an absolute
    // path which cannot equal a Version file's relativePath.
    Ok(published_source_key(&raw_dir, &absolute) == file)
}

fn published_source_key(raw_dir: &str, normalized_absolute: &str) -> String {
    normalized_absolute.replacen(&format!("{raw_dir}/"), "", 1)
}

fn report(rows: &[Value], include_message: bool, chalk: Chalk) -> io::Result<String> {
    let selected = selected(rows);
    if selected.is_empty() {
        return Ok(chalk.yellow("no results found"));
    }
    let current = text(selected[0].get("contents"))?;
    let lines = current.split('\n').collect::<Vec<_>>();
    let owners = owners(rows, &selected, lines.len())?;
    let cells = cells(&selected, &lines, &owners, include_message)?;
    let borrowed = cells
        .iter()
        .map(|row| row.iter().map(String::as_str).collect())
        .collect::<Vec<_>>();
    Ok(log::table_with_separator(&borrowed, &chalk.gray(" ")))
}

fn selected(rows: &[Value]) -> Vec<&Value> {
    let hidden: HashMap<&str, &Value> = rows
        .iter()
        .filter(|row| row["log"]["hidden"] == true)
        .filter_map(|row| Some((row["log"]["hash"].as_str()?, row)))
        .collect();
    let mut selected = rows
        .iter()
        .filter(|row| row["log"]["hidden"] != true && row["fileHash"].is_string())
        .filter(|row| row["fileHash"] != effective_parent(row, &hidden))
        .collect::<Vec<_>>();
    selected.sort_by_key(|row| row["headOrder"].as_u64().unwrap_or(u64::MAX));
    selected
}

fn owners(rows: &[Value], selected: &[&Value], lines: usize) -> io::Result<Vec<usize>> {
    let sources: HashMap<&str, &str> = rows
        .iter()
        .filter_map(|row| Some((row["fileHash"].as_str()?, row["contents"].as_str()?)))
        .collect();
    let hidden: HashMap<&str, &Value> = rows
        .iter()
        .filter(|row| row["log"]["hidden"] == true)
        .filter_map(|row| Some((row["log"]["hash"].as_str()?, row)))
        .collect();
    let mut owners = vec![None; lines];
    for (index, row) in selected.iter().enumerate() {
        if owners.iter().all(Option::is_some) {
            break;
        }
        let Some(parent_hash) = effective_parent(row, &hidden).as_str().map(str::to_string) else {
            continue;
        };
        let parent = sources
            .get(parent_hash.as_str())
            .ok_or_else(|| decline("blame parent source absent"))?;
        assign_changed(&mut owners, index, parent, text(row.get("contents"))?);
    }
    Ok(owners
        .into_iter()
        .map(|owner| owner.unwrap_or(selected.len() - 1))
        .collect())
}

fn cells(
    selected: &[&Value],
    lines: &[&str],
    owners: &[usize],
    include_message: bool,
) -> io::Result<Vec<Vec<String>>> {
    lines
        .iter()
        .enumerate()
        .map(|(index, line)| {
            let row = &selected[owners[index]]["normalized"];
            let hash = text(row.get("hash"))?;
            let message = if include_message {
                text(row.get("message"))?
                    .lines()
                    .next()
                    .unwrap_or_default()
            } else {
                ""
            };
            Ok(vec![
                hash[..hash.len().min(9)].to_string(),
                row["tag"]
                    .as_str()
                    .map(str::trim)
                    .unwrap_or_default()
                    .to_string(),
                text(row.get("username"))?.to_string(),
                row["date"]
                    .as_str()
                    .map(str::trim)
                    .filter(|date| !date.is_empty())
                    .unwrap_or("<N/A>")
                    .to_string(),
                message.to_string(),
                format!("{})", index + 1),
                (*line).to_string(),
            ])
        })
        .collect()
}

fn effective_parent(row: &Value, hidden: &HashMap<&str, &Value>) -> Value {
    let parents = row["log"]["parents"].as_array();
    if let Some([parent]) = parents.map(Vec::as_slice)
        && let Some(ancestor) = parent
            .as_str()
            .and_then(|hash| hidden.get(hash))
    {
        return ancestor["parentFileHash"].clone();
    }
    row["parentFileHash"].clone()
}

fn assign_changed(owners: &mut [Option<usize>], index: usize, parent: &str, current: &str) {
    let mut line = 0;
    for change in diff::lines(parent, current) {
        match change {
            diff::Result::Both(..) => line += 1,
            diff::Result::Right(..) => {
                if let Some(owner) = owners.get_mut(line)
                    && owner.is_none()
                {
                    *owner = Some(index);
                }
                line += 1;
            }
            diff::Result::Left(..) => {}
        }
    }
}
