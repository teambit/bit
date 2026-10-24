//! Native `bit pattern <pattern>` (`PatternCommand` in `scopes/workspace/workspace/pattern.cmd.ts`).

use super::{
    Command,
    color::Chalk,
    engine::Engine,
    inventory, patterns,
    remote_resolution::Session,
    status::cache::cache_root,
    workspace_command::{self, NodeCli, format::Formatter, results::Report},
};
use crate::{native::Outcome, workspace};
use bit_install::workspace::{Bitmap, BitmapEntry};
use serde_json::{Value, json};
use std::{
    env,
    ffi::OsString,
    fs,
    io::{self, Write},
    path::Path,
};

pub const COMMAND: Command = Command { name: "pattern", aliases: &[], run };

#[derive(Debug, Clone, PartialEq, Eq)]
struct Options {
    pattern: String,
    json: bool,
    remote: bool,
}

enum Failure {
    Declined(String),
    User(String),
}

impl From<io::Error> for Failure {
    fn from(error: io::Error) -> Self {
        Self::Declined(error.to_string())
    }
}

fn run(args: &[OsString]) -> io::Result<Outcome> {
    let Some(options) = parse_options(args) else {
        return Ok(Outcome::Declined("arguments outside the native `pattern` grammar".to_owned()));
    };
    let Some(root) = workspace::root(&env::current_dir()?) else {
        return Ok(Outcome::Declined("not inside a workspace".to_owned()));
    };
    let Some(default_scope) = workspace_default_scope(&root) else {
        return Ok(Outcome::Declined("unsupported workspace configuration".to_owned()));
    };
    let mut session = Session::new(Some(&root), args);
    let resolved = if options.remote {
        remote_ids(&root, &options.pattern, &mut session)
    } else {
        local_ids(&root, &default_scope, &options.pattern)
    };
    match resolved {
        Ok(ids) => present(&root, args, &options, &ids, &session),
        Err(Failure::User(message)) => {
            if env::var_os("CI").is_some_and(|value| !value.is_empty()) {
                return Ok(Outcome::Declined("CI pattern error stack".to_owned()));
            }
            present_error(&root, args, &options, &session, io::Error::other(message))
        }
        Err(Failure::Declined(reason)) if session.owned() => {
            present_error(&root, args, &options, &session, io::Error::other(reason))
        }
        Err(Failure::Declined(reason)) => Ok(Outcome::Declined(format!("pattern: {reason}"))),
    }
}

fn parse_options(args: &[OsString]) -> Option<Options> {
    let tokens = args
        .iter()
        .skip(1)
        .map(|arg| arg.to_str())
        .collect::<Option<Vec<_>>>()?;
    let mut pattern = None;
    let mut json = false;
    let mut remote = false;
    for token in tokens {
        match token {
            "-j" | "--json" | "--json=true" => json = true,
            "--json=false" => json = false,
            "-r" | "--remote" | "--remote=true" => remote = true,
            "--remote=false" => remote = false,
            "-jr" | "-rj" => {
                json = true;
                remote = true;
            }
            flag if flag.starts_with('-') => return None,
            value if pattern.is_none() && !value.is_empty() => pattern = Some(value.to_owned()),
            _ => return None,
        }
    }
    let pattern = pattern?;
    if pattern.contains('$') || pattern.contains(':') || pattern.contains(" AND ") {
        return None;
    }
    Some(Options { pattern, json, remote })
}

fn workspace_default_scope(root: &Path) -> Option<String> {
    let bytes = fs::read(root.join("workspace.jsonc")).ok()?;
    let config = bit_workspace_config::parse_jsonc(&bytes).ok()?;
    let ws = &config["teambit.workspace/workspace"];
    if ws["bitmapAutoSync"] == true {
        return None;
    }
    ws["defaultScope"]
        .as_str()
        .filter(|scope| !scope.is_empty())
        .map(str::to_owned)
}

fn local_ids(root: &Path, default_scope: &str, pattern: &str) -> Result<Vec<String>, Failure> {
    let bitmap = Bitmap::load(root, Some(default_scope))?;
    if bitmap.lane
        .as_ref()
        .is_some_and(|lane| lane.name != "main" && lane.exported)
    {
        let scope_dir = workspace::scope_path(root);
        if !scope_dir.join("objects").is_dir() {
            return Err(Failure::Declined("missing local scope objects".to_owned()));
        }
    }
    if !is_pattern(pattern) {
        return resolve_literal_id(root, &bitmap, pattern);
    }
    let active = bitmap.entries
        .iter()
        .filter(|entry| entry.owns_its_dir())
        .map(entry_full_id)
        .collect::<Vec<_>>();
    filter_pool_by_pattern(&active, pattern)
}

fn is_pattern(pattern: &str) -> bool {
    pattern.contains(['*', ',', '!', '$', ':'])
}

fn resolve_literal_id(root: &Path, bitmap: &Bitmap, pattern: &str) -> Result<Vec<String>, Failure> {
    if pattern.contains('@') || pattern.starts_with("teambit.") {
        return Err(Failure::Declined(
            "literal id requires package or aspect resolution".to_owned(),
        ));
    }
    if let Some(matched) = find_bitmap_literal(bitmap, pattern) {
        return Ok(matched);
    }
    if is_known_empty_literal(root, pattern)? {
        return Ok(Vec::new());
    }
    Err(Failure::User(format!(
        r#"error: component ID "{pattern}" is invalid, please use the following format: [scope]/<name>"#,
    )))
}

fn find_bitmap_literal(bitmap: &Bitmap, pattern: &str) -> Option<Vec<String>> {
    let normalized = inventory::normalize(pattern);
    let directory = normalized.strip_prefix("./").unwrap_or(&normalized);
    let entry = bitmap.entries
        .iter()
        .find(|entry| !entry.root_dir.is_empty() && entry.root_dir == directory)
        .or_else(|| {
            bitmap.entries
                .iter()
                .find(|entry| {
                    entry.id.to_string_without_version() == pattern || entry.id.name == pattern
                })
        })?;
    Some(if entry.owns_its_dir() { vec![entry_full_id(entry)] } else { Vec::new() })
}

fn is_known_empty_literal(root: &Path, pattern: &str) -> Result<bool, Failure> {
    if let Some((scope, name)) = pattern.split_once('/') {
        if valid_scope_name(scope) && valid_id_chunk(name) {
            return Ok(true);
        }
        return Err(Failure::Declined("invalid scoped literal component id".to_owned()));
    }
    Ok(!pattern.contains('.') && exists_in_scope_index(root, pattern))
}

fn exists_in_scope_index(root: &Path, name: &str) -> bool {
    let index_path = workspace::scope_path(root).join("index.json");
    let Ok(bytes) = fs::read(index_path) else {
        return false;
    };
    let Ok(index) = serde_json::from_slice::<Value>(&bytes) else {
        return false;
    };
    index["components"]
        .as_array()
        .is_some_and(|components| {
            components
                .iter()
                .any(|item| item["id"]["name"].as_str() == Some(name))
        })
}

fn valid_id_chunk(chunk: &str) -> bool {
    !chunk.is_empty()
        && !chunk.contains("//")
        && chunk
            .chars()
            .all(|ch| {
                ch.is_ascii_lowercase() || ch.is_ascii_digit() || matches!(ch, '-' | '_' | '/')
            })
}

fn valid_scope_name(scope: &str) -> bool {
    let valid_part = |part: &str| {
        !part.is_empty()
            && part
                .chars()
                .all(|ch| {
                    ch.is_ascii_lowercase()
                        || ch.is_ascii_digit()
                        || matches!(ch, '$' | '-' | '_' | '!')
                })
    };
    match scope.split_once('.') {
        Some((left, right)) => !right.contains('.') && valid_part(left) && valid_part(right),
        None => scope.len() >= 2 && valid_part(scope),
    }
}

fn entry_full_id(entry: &BitmapEntry) -> String {
    let identity = entry.id.to_string_without_version();
    match &entry.id.version {
        Some(version) if !version.is_empty() && version != "latest" => {
            format!("{identity}@{version}")
        }
        _ => identity,
    }
}

fn remote_ids(root: &Path, pattern: &str, session: &mut Session) -> Result<Vec<String>, Failure> {
    let scopes = remote_scopes_from_pattern(pattern)?;
    let cli = NodeCli::find()?;
    let mut engine = Engine::new()?;
    let mut all_ids = Vec::new();
    for scope in &scopes {
        all_ids.extend(fetch_remote_scope_ids(root, scope, &cli, session, &mut engine)?);
    }
    filter_pool_by_pattern(&all_ids, pattern)
}

fn remote_scopes_from_pattern(pattern: &str) -> Result<Vec<String>, Failure> {
    let mut scopes = Vec::new();
    for part in pattern
        .split(',')
        .map(str::trim)
        .filter(|part| !part.starts_with('!'))
    {
        let Some((scope, _)) = part.split_once('/') else {
            return Err(Failure::User(format!(
                r#"when using --remote, the pattern must include the scope name followed by "/", e.g. "scope-name/**". got "{part}""#,
            )));
        };
        if scope.is_empty() || scope.contains(['*', '?']) {
            return Err(Failure::Declined("remote scope name contains wildcards".to_owned()));
        }
        if !scopes.iter().any(|seen| seen == scope) {
            scopes.push(scope.to_owned());
        }
    }
    Ok(scopes)
}

fn fetch_remote_scope_ids(
    root: &Path,
    scope: &str,
    cli: &NodeCli,
    session: &mut Session,
    engine: &mut Engine,
) -> Result<Vec<String>, Failure> {
    session
        .resolve(std::slice::from_ref(&scope.to_owned()))
        .map_err(|error| {
            if super::remote_resolution::is_ci_decline(&error) {
                Failure::Declined(error.to_string())
            } else {
                Failure::User(error.to_string())
            }
        })?;
    let query = json!({
        "kind": "commandRemoteInventory",
        "root": root,
        "mode": "list",
        "scope": scope,
        "namespaces": Value::Null,
        "includeDeleted": false,
        "hosts": session.overrides(),
        "globalConfigDir": cache_root().join("config"),
        "nodeExecutable": cli.node,
        "bitDir": cli.bit_dir,
        "bitVersion": cli.version,
    });
    let result: Value = engine
        .request(&query)
        .map_err(|error| {
            if super::engine::is_canonical(&error) {
                Failure::User(error.to_string())
            } else {
                Failure::Declined(error.to_string())
            }
        })?;
    parse_remote_component_ids(&result)
}

fn parse_remote_component_ids(result: &Value) -> Result<Vec<String>, Failure> {
    result["components"]
        .as_array()
        .ok_or_else(|| Failure::Declined("remote list components".to_owned()))?
        .iter()
        .map(|row| {
            row["id"]
                .as_str()
                .map(str::to_owned)
                .ok_or_else(|| Failure::Declined("remote list component id".to_owned()))
        })
        .collect()
}

fn filter_pool_by_pattern(pool_ids: &[String], pattern: &str) -> Result<Vec<String>, Failure> {
    let mut entries = Vec::<(String, String)>::new();
    for id in pool_ids {
        let identity = id.rsplit_once('@').map_or(id.as_str(), |(identity, _)| identity);
        if let Some((_, full)) = entries
            .iter_mut()
            .find(|(seen, _)| seen == identity)
        {
            full.clone_from(id);
        } else {
            entries.push((identity.to_owned(), id.clone()));
        }
    }
    let identities = entries
        .iter()
        .map(|(identity, _)| identity.as_str())
        .collect::<Vec<_>>();
    let matched = patterns::extended::matching(&identities, &patterns::split(pattern))?;
    Ok(matched
        .into_iter()
        .filter_map(|identity| {
            entries
                .iter()
                .find_map(|(seen, full)| (seen == identity).then(|| full.clone()))
        })
        .collect())
}

fn present(
    root: &Path,
    args: &[OsString],
    options: &Options,
    ids: &[String],
    session: &Session,
) -> io::Result<Outcome> {
    if options.json {
        let body = serde_json::to_string_pretty(ids)?;
        return workspace_command::execute_json(root, args, "pattern", |_output| {
            io::stdout()
                .lock()
                .write_all(session.output().as_bytes())?;
            Ok(Report { data: body, code: 0, details: None })
        });
    }
    let formatter = Formatter::new(Chalk::detect(args));
    let items = ids
        .iter()
        .map(|id| formatter.item(id))
        .collect::<Vec<_>>();
    let title =
        formatter.success_summary(&format!("found {} components matching the pattern", ids.len()));
    let report = Report { data: format!("{title}\n{}", items.join("\n")), code: 0, details: None };
    workspace_command::execute_with(root, args, "pattern", &report, |_output| {
        io::stdout()
            .lock()
            .write_all(session.output().as_bytes())
    })
}

fn present_error(
    root: &Path,
    args: &[OsString],
    options: &Options,
    session: &Session,
    error: io::Error,
) -> io::Result<Outcome> {
    let callback = |_output: &bit_install::output::Output| -> io::Result<Report> {
        io::stdout()
            .lock()
            .write_all(session.output().as_bytes())?;
        Err(error)
    };
    if options.json {
        workspace_command::execute_json(root, args, "pattern", callback)
    } else {
        workspace_command::execute_then(root, args, "pattern", callback)
    }
}

#[cfg(test)]
mod tests;
