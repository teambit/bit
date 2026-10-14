//! Native `bit list` (`ls`) of the workspace on main: `ListCmd` with
//! `ListerMain.localList` and `ComponentsList.listAll`. The workspace engine's
//! `scopeList` reads the scope's models; the bitmap gives the workspace ids.
//!
//! On a lane, the components' heads are their lane heads.
//!
//! A remote scope, `--outdated`, `--include-deleted`, and ids or namespaces
//! this module cannot match like Node run on the Node.js CLI.

mod bitmap;
mod table;

use super::{color::Chalk, engine::Engine, status::collate, workspace_command};
use crate::{commands::Command, history::History, native::Outcome, workspace};
use serde_json::{Map, Value, json};
use std::{
    env,
    ffi::OsString,
    io::{self, Write},
    path::Path,
    process::ExitCode,
};

pub const COMMAND: Command = Command { name: "list", aliases: &["ls"], run };

/// The flags `ListCmd` takes that run natively.
#[derive(Debug, Default, PartialEq, Eq)]
struct Options {
    ids: bool,
    local_scope: bool,
    scope: Option<String>,
    json: bool,
    namespace: Option<String>,
}

/// `args` starts after the command name; `None` for anything else.
fn parse(args: &[&str]) -> Option<Options> {
    let mut options = Options::default();
    let mut seen: Vec<&str> = Vec::new();
    let mut index = 0;
    while index < args.len() {
        let flag = long_flag(args[index]);
        index += 1;
        if seen.contains(&flag) {
            return None;
        }
        seen.push(flag);
        index += options.flag(flag, args.get(index).copied())?;
    }
    Some(options)
}

/// The long name of a short flag.
fn long_flag(flag: &str) -> &str {
    match flag {
        "-i" => "--ids",
        "-l" => "--local-scope",
        "-s" => "--scope",
        "-j" => "--json",
        "-n" => "--namespace",
        other => other,
    }
}

impl Options {
    /// One flag; the number of values it consumed.
    fn flag(&mut self, flag: &str, next: Option<&str>) -> Option<usize> {
        match flag {
            "--ids" => self.ids = true,
            "--local-scope" => self.local_scope = true,
            "--json" => self.json = true,
            "--scope" | "--namespace" => {
                let value = next.filter(|value| !value.starts_with('-') && !value.is_empty())?;
                let value = Some(value.to_string());
                if flag == "--scope" {
                    self.scope = value;
                } else {
                    self.namespace = value;
                }
                return Some(1);
            }
            _ => return None,
        }
        Some(0)
    }
}

fn run(args: &[OsString]) -> io::Result<Outcome> {
    let Some(arguments) = workspace_command::utf8_args(args) else {
        return Ok(Outcome::Declined("the arguments are not UTF-8".to_string()));
    };
    let Some(options) = parse(&arguments[1..]) else {
        return Ok(Outcome::Declined("flags outside the native `list` grammar".to_string()));
    };
    let Some(root) = workspace::root(&env::current_dir()?) else {
        return Ok(Outcome::Declined("not inside a workspace".to_string()));
    };
    if !collate::root_locale() {
        return Ok(Outcome::Declined("the locale may collate ids differently".to_string()));
    }
    let rows = match list(&root, &options) {
        Ok(rows) => rows,
        Err(error) => return Ok(Outcome::Declined(format!("list: {error}"))),
    };
    if options.json {
        let history = History::start(&root, args);
        // `CommandRunner` writes `JSON.stringify(data, null, 2)` without a newline.
        let mut stdout = io::stdout().lock();
        stdout.write_all(
            serde_json::to_string_pretty(&json_report(&rows, options.ids))?.as_bytes(),
        )?;
        stdout.flush()?;
        history.end(true);
        return Ok(Outcome::Exit(ExitCode::SUCCESS));
    }
    let report = workspace_command::results::Report {
        data: report(&rows, options.ids, Chalk::detect(args), table::colors(args)),
        code: 0,
        details: None,
    };
    workspace_command::execute_with(&root, args, "list", &report, |output| {
        output.status("listing components");
        Ok(())
    })
}

/// A `ListScopeResult`.
#[derive(Debug, PartialEq, Eq)]
struct Row {
    /// `scope/name`.
    identity: String,
    /// The latest version in the scope, `None` for a new component.
    version: Option<String>,
    deprecated: bool,
    lane_readme_of: Vec<String>,
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
        .filter(|row| listed(row, &bitmap, &lane, options))
        .collect();
    if !rows
        .iter()
        .all(|row| collate::supported(&row.id()))
    {
        return Err(decline("ids outside the supported collation"));
    }
    rows.sort_by(|left, right| collate::compare(&left.id(), &right.id()));
    Ok(rows)
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
        version: model.map(|model| model.version.clone()),
        deprecated: model.is_some_and(|model| model.deprecated),
        lane_readme_of: model.map_or_else(Vec::new, |model| model.lane_readme_of.clone()),
        used: entry.and_then(|entry| entry.version.clone()),
        root_dir: entry.map(|entry| entry.root_dir.clone()),
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

/// `ListCmd.json`: the ids, or `listTemplate(results, true, false)`.
fn json_report(rows: &[Row], ids: bool) -> Value {
    if ids {
        return json!(
            rows.iter()
                .map(Row::id)
                .collect::<Vec<_>>()
        );
    }
    Value::Array(
        rows.iter()
            .map(|row| {
                let mut data = Map::new();
                data.insert("id".into(), json!(row.identity));
                data.insert("localVersion".into(), json!(local_version(row)));
                data.insert("deprecated".into(), json!(row.deprecated));
                data.insert("currentVersion".into(), json!(current_version(row)));
                data.insert("remoteVersion".into(), json!("N/A"));
                if let Some(root_dir) = &row.root_dir {
                    data.insert("rootDir".into(), json!(root_dir));
                }
                Value::Object(data)
            })
            .collect(),
    )
}

fn local_version(row: &Row) -> &str {
    row.version.as_deref().unwrap_or("<new>")
}

fn current_version(row: &Row) -> &str {
    row.used.as_deref().unwrap_or("N/A")
}

/// `ListCmd.report`: the count, then the ids or the table.
fn report(rows: &[Row], ids: bool, chalk: Chalk, colors: bool) -> String {
    let header = format!("found {} components\n", rows.len());
    if rows.is_empty() {
        return header;
    }
    if ids {
        return serde_json::to_string(
            &rows
                .iter()
                .map(Row::id)
                .collect::<Vec<_>>(),
        )
        .unwrap_or_default();
    }
    let has_path = rows.iter().any(|row| row.root_dir.is_some());
    let mut head = vec!["component ID", "latest in scope", "used in workspace"];
    if has_path {
        head.push("path");
    }
    let cells: Vec<Vec<String>> = rows
        .iter()
        .map(|row| {
            let mut cells = vec![
                formatted_id(row, chalk),
                local_version(row).to_string(),
                current_version(row).to_string(),
            ];
            if has_path {
                cells.push(row.root_dir.clone().unwrap_or_default());
            }
            cells
        })
        .collect();
    let mut report = header;
    report.push_str(&table::render(&head, &cells, colors));
    report
}

/// `getFormattedId` of `listTemplate`.
fn formatted_id(row: &Row, chalk: Chalk) -> String {
    let mut id = chalk.white(&row.identity);
    if row.deprecated {
        id = chalk.yellow(&format!("{id} [Deprecated]"));
    }
    if !row.lane_readme_of.is_empty() {
        id.push('\n');
        for lane in &row.lane_readme_of {
            id.push_str(&chalk.yellow(&format!("[Lane Readme]: {lane}\n")));
        }
    }
    id
}

fn decline(reason: &str) -> io::Error {
    io::Error::other(reason.to_string())
}

#[cfg(test)]
mod list_tests;
