//! Native local and remote `bit list` (`ls`): `ListCmd` with
//! `ListerMain.localList` and `ComponentsList.listAll`. The workspace engine's
//! `scopeList` reads the scope's models; the bitmap gives the workspace ids.
//!
//! On a lane, the components' heads are their lane heads.
//!
//! Rust reads scalar remote inventory and latest versions without importing
//! objects; unsupported input and diagnostics delegate before effects.

pub(in crate::commands) mod bitmap;
pub(super) mod table;

mod options;
mod remote;
mod report;
use options::{Options, parse};
use report::{json_report, report};

use super::{color::Chalk, engine::Engine, status::collate, workspace_command};
use crate::{commands::Command, history::History, native::Outcome, workspace};
use serde_json::{Value, json};
use std::{
    env,
    ffi::OsString,
    io::{self, Write},
    path::Path,
    process::ExitCode,
};

pub const COMMAND: Command = Command { name: "list", aliases: &["ls"], run };

fn run(args: &[OsString]) -> io::Result<Outcome> {
    let Some(arguments) = workspace_command::utf8_args(args) else {
        return Ok(Outcome::Declined("the arguments are not UTF-8".to_string()));
    };
    let Some(options) = parse(&arguments[1..]) else {
        return Ok(Outcome::Declined("flags outside the native `list` grammar".to_string()));
    };
    let root = workspace::root(&env::current_dir()?);
    if let Some(reason) = unsupported(root.as_deref(), &options) {
        return Ok(Outcome::Declined(reason.into()));
    }
    let rows = match prepared_rows(root.as_deref(), &options) {
        Ok(rows) => rows,
        Err(error) => return Ok(Outcome::Declined(format!("list: {error}"))),
    };
    present(root.as_deref(), args, &rows, &options)
}

fn unsupported(root: Option<&Path>, options: &Options) -> Option<&'static str> {
    if root.is_none() && options.remote.is_none() {
        return Some("not inside a workspace");
    }
    if options.remote.is_some() && (options.local_scope || options.scope.is_some()) {
        return Some("remote list with local scope filtering");
    }
    if !collate::root_locale() {
        return Some("the locale may collate ids differently");
    }
    None
}

fn prepared_rows(root: Option<&Path>, options: &Options) -> io::Result<Vec<Row>> {
    let mut rows = if options.remote.is_some() {
        remote::list(root, options)?
    } else {
        list(root.unwrap(), options)?
    };
    sort(&mut rows)?;
    if options.outdated && !options.json && !options.ids {
        validate_versions(&rows)?;
    }
    Ok(rows)
}

fn present(
    root: Option<&Path>,
    args: &[OsString],
    rows: &[Row],
    options: &Options,
) -> io::Result<Outcome> {
    if options.json {
        return json_output(root, args, rows, options.ids);
    }
    let report = workspace_command::results::Report {
        data: report(rows, options, Chalk::detect(args), table::colors(args)),
        code: 0,
        details: None,
    };
    let status =
        if options.remote.is_some() { "listing remote components" } else { "listing components" };
    if let Some(root) = root {
        workspace_command::execute_with(root, args, "list", &report, |output| {
            output.status(status);
            Ok(())
        })
    } else {
        let output = workspace_command::loader_output(Chalk::detect(args), false);
        output.restart(r#"running command "list"..."#);
        output.status(status);
        output.stop();
        writeln!(io::stdout().lock(), "{}", report.data)?;
        Ok(Outcome::Exit(ExitCode::SUCCESS))
    }
}

fn json_output(
    root: Option<&Path>,
    args: &[OsString],
    rows: &[Row],
    ids: bool,
) -> io::Result<Outcome> {
    let history = root.map(|root| History::start(root, args));
    // `CommandRunner` writes `JSON.stringify(data, null, 2)` without a newline.
    let mut stdout = io::stdout().lock();
    stdout.write_all(serde_json::to_string_pretty(&json_report(rows, ids))?.as_bytes())?;
    stdout.flush()?;
    if let Some(history) = history {
        history.end(true);
    }
    Ok(Outcome::Exit(ExitCode::SUCCESS))
}

/// A `ListScopeResult`.
#[derive(Debug, PartialEq, Eq)]
struct Row {
    /// `scope/name`.
    identity: String,
    workspace: WorkspaceRow,
    /// The latest version in the scope, `None` for a new component.
    version: Option<String>,
    deprecated: Option<bool>,
    removed: Option<bool>,
    remote_version: Option<String>,
    lane_readme_of: Vec<String>,
}

/// Workspace identity and location facts used independently of stored model versions.
#[derive(Debug, PartialEq, Eq)]
struct WorkspaceRow {
    has_scope: bool,
    /// `currentlyUsedVersion`: the bitmap's version.
    used: Option<String>,
    root_dir: Option<String>,
}

impl Row {
    /// `id.toString()`.
    fn id(&self) -> String {
        self.version
            .as_ref()
            .map_or_else(|| self.identity.clone(), |version| format!("{}@{version}", self.identity))
    }
}

/// A model of `scopeList`.
struct Model {
    identity: String,
    /// `getHeadRegardlessOfLaneAsTagOrHash(true)`.
    version: String,
    deprecated: bool,
    lane_readme_of: Vec<String>,
}

/// `localList`: the workspace's (or with `--local-scope`, the scope's) ids,
/// filtered, sorted by `localeCompare` of their ids.
fn list(root: &Path, options: &Options) -> io::Result<Vec<Row>> {
    let bitmap::Bitmap { entries: bitmap, lane } = bitmap::read(root)?;
    let (models, lane) = models(root, lane.as_ref())?;
    let mut ids = all_ids(&bitmap, &models, options.local_scope);
    if let Some(namespace) = &options.namespace {
        let pattern = Wildcard::new(&namespace_pattern(namespace))?;
        ids.retain(|(identity, has_scope)| pattern.matches(wildcard_name(identity, *has_scope)));
    }
    let mut rows: Vec<Row> = ids
        .into_iter()
        .map(|(identity, _)| row(identity, &bitmap, &models))
        .collect();
    sort(&mut rows)?;
    if options.outdated {
        remote::versions(root, &mut rows)?;
    }
    rows.retain(|row| listed(row, &bitmap, &lane, options));
    Ok(rows)
}

fn sort(rows: &mut [Row]) -> io::Result<()> {
    if !rows
        .iter()
        .all(|row| collate::supported(&row.id()))
    {
        return Err(decline("ids outside the supported collation"));
    }
    rows.sort_by(|left, right| collate::compare(&left.id(), &right.id()));
    Ok(())
}

/// `listTemplate` calls strict npm semver only for non-JSON, non-ID outdated reports.
fn validate_versions(rows: &[Row]) -> io::Result<()> {
    for row in rows {
        if let Some(remote) = &row.remote_version
            && row.version
                .as_ref()
                .is_none_or(|local| node_semver::npm::compare(local, remote, false).is_none())
        {
            return Err(decline("outdated table requires the published semver diagnostic"));
        }
    }
    Ok(())
}

/// `--scope`'s filter, then, without `--local-scope`, `isIdOnCurrentLane`.
/// `lane` lists the current lane's components.
fn listed(row: &Row, bitmap: &[bitmap::Entry], lane: &[String], options: &Options) -> bool {
    let in_scope = options.scope
        .as_ref()
        .is_none_or(|scope| {
            row.identity
                .split_once('/')
                .is_some_and(|(own, _)| own == scope)
        });
    let on_lane = || {
        bitmap
            .iter()
            .any(|entry| entry.identity == row.identity && entry.on_current_lane(lane))
    };
    in_scope && (options.local_scope || on_lane())
}

/// The scope's models, from the engine's `scopeList` with their heads on the
/// current lane, and that lane's components.
fn models(root: &Path, lane: Option<&Value>) -> io::Result<(Vec<Model>, Vec<String>)> {
    let mut engine = Engine::new()?;
    let mut request = json!({"kind": "scopeList", "root": root});
    if let Some(lane) = lane {
        request["lane"] = lane.clone();
    }
    let listed: Value = engine.request(&request)?;
    let models = listed["components"]
        .as_array()
        .ok_or_else(|| decline("scope list"))?
        .iter()
        .map(model)
        .collect::<io::Result<_>>()?;
    let lane = listed["laneComponents"]
        .as_array()
        .ok_or_else(|| decline("scope list lane"))?
        .iter()
        .map(|id| {
            id.as_str()
                .map(str::to_string)
                .ok_or_else(|| decline("scope list lane"))
        })
        .collect::<io::Result<_>>()?;
    Ok((models, lane))
}

/// `ComponentIdList.uniqFromArray`: the bitmap's ids first, then the
/// models', each with whether it has its own scope.
fn all_ids(bitmap: &[bitmap::Entry], models: &[Model], local_scope: bool) -> Vec<(String, bool)> {
    let workspace = bitmap
        .iter()
        .filter(|_| !local_scope)
        .map(|entry| (&entry.identity, entry.has_scope));
    let scope = models
        .iter()
        .map(|model| (&model.identity, true));
    let mut ids: Vec<(String, bool)> = Vec::new();
    for (identity, has_scope) in workspace.chain(scope) {
        if !ids
            .iter()
            .any(|(seen, _)| seen == identity)
        {
            ids.push((identity.clone(), has_scope));
        }
    }
    ids
}

/// What `isBitIdMatchByWildcards` matches: the id, or the name of an id
/// without its own scope.
fn wildcard_name(identity: &str, has_scope: bool) -> &str {
    if has_scope {
        return identity;
    }
    identity.split_once('/').map_or(identity, |(_, name)| name)
}

/// The `ListScopeResult` of an id.
fn row(identity: String, bitmap: &[bitmap::Entry], models: &[Model]) -> Row {
    let model = models
        .iter()
        .find(|model| model.identity == identity);
    let entry = bitmap
        .iter()
        .find(|entry| entry.identity == identity);
    Row {
        workspace: WorkspaceRow {
            has_scope: entry.map_or_else(|| model.is_some(), |entry| entry.has_scope),
            used: entry.and_then(|entry| entry.version.clone()),
            root_dir: entry.map(|entry| entry.root_dir.clone()),
        },
        version: model.map(|model| model.version.clone()),
        deprecated: Some(model.is_some_and(|model| model.deprecated)),
        removed: None,
        remote_version: None,
        lane_readme_of: model.map_or_else(Vec::new, |model| model.lane_readme_of.clone()),
        identity,
    }
}

fn model(value: &Value) -> io::Result<Model> {
    let scope = value["scope"]
        .as_str()
        .filter(|scope| !scope.is_empty());
    let name = value["name"]
        .as_str()
        .filter(|name| !name.is_empty());
    let (Some(scope), Some(name)) = (scope, name) else {
        return Err(decline("model without a scope"));
    };
    let versions = value["versions"].as_object().ok_or_else(|| decline("model versions"))?;
    let version = match value["head"].as_str() {
        // `getTagOfRefIfExists(head) || head`.
        Some(head) => versions
            .iter()
            .find(|(_, hash)| hash.as_str() == Some(head))
            .map_or_else(|| head.to_string(), |(tag, _)| tag.clone()),
        None if versions.is_empty() => "0.0.0".to_string(),
        None => return Err(decline("model with tags but no head")),
    };
    let lane_readme_of = value["laneReadmeOf"]
        .as_array()
        .ok_or_else(|| decline("lane readme"))?
        .iter()
        .map(|lane| {
            lane.as_str()
                .map(str::to_string)
                .ok_or_else(|| decline("lane readme"))
        })
        .collect::<io::Result<_>>()?;
    Ok(Model {
        identity: format!("{scope}/{name}"),
        version,
        deprecated: value["deprecated"] == true,
        lane_readme_of,
    })
}

/// `getNamespaceWithWildcard`, then `**/<namespace>` of `listAll`.
fn namespace_pattern(namespace: &str) -> String {
    if namespace.contains('*') { format!("**/{namespace}") } else { format!("**/{namespace}/**") }
}

/// `isBitIdMatchByWildcards`' regex: `*` becomes `.*`, anchored. Other
/// regular expression syntax than `.` declines.
struct Wildcard(Vec<char>);

impl Wildcard {
    fn new(pattern: &str) -> io::Result<Self> {
        if pattern
            .chars()
            .any(|character| r"\^$+?()[]{}|".contains(character))
        {
            return Err(decline("namespace with regular expression syntax"));
        }
        Ok(Self(pattern.chars().collect()))
    }

    fn matches(&self, text: &str) -> bool {
        let text: Vec<char> = text.chars().collect();
        matches_at(&self.0, &text)
    }
}

/// `*` is `.*`; `.` is any character but a line terminator.
fn matches_at(pattern: &[char], text: &[char]) -> bool {
    match pattern.split_first() {
        None => text.is_empty(),
        Some(('*', rest)) => (0..=text.len())
            .take_while(|&skip| skip == 0 || !line_terminator(text[skip - 1]))
            .any(|skip| matches_at(rest, &text[skip..])),
        Some((&expected, rest)) => text
            .split_first()
            .is_some_and(|(&actual, remaining)| {
                let same =
                    if expected == '.' { !line_terminator(actual) } else { expected == actual };
                same && matches_at(rest, remaining)
            }),
    }
}

const fn line_terminator(character: char) -> bool {
    matches!(character, '\n' | '\r' | '\u{2028}' | '\u{2029}')
}

fn decline(reason: &str) -> io::Error {
    io::Error::other(reason.to_string())
}

#[cfg(test)]
mod list_tests;
