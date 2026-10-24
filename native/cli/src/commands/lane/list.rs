//! Native lane inspection (`list`, `current`, `show`): the
//! lanes of the local scope (`getLanes({ showDefaultLane: true })`), then
//! main with the workspace's components.
//!
//! HTTP remotes and lanes Node would migrate to the schema that records
//! deleted components run on the Node.js CLI.

pub(super) mod remote;
pub(super) use metadata::components_report;
pub(super) use remote::project as project_http;
mod merged;
mod metadata;

use crate::{
    commands::{
        color::Chalk,
        engine::Engine,
        list::bitmap,
        status::js::{array, decline, text},
        workspace_command::{self, format::Formatter, results::Report},
    },
    history::History,
    native::Outcome,
};
use metadata::{readme, report, report_others, updates};
use serde_json::{Map, Value, json};
use std::{
    ffi::OsString,
    fs,
    io::{self, Write},
    path::Path,
    process::ExitCode,
};

/// The schema of lanes that record their deleted components.
const DELETED_DATA_SCHEMA: &str = "1.0.0";

/// A lane's data, as `serializeLaneData` writes it.
#[derive(Clone)]
pub(super) struct LaneData {
    /// `{ name, scope }`.
    pub(super) id: Value,
    pub(super) alias: Option<String>,
    pub(super) components: Vec<Value>,
    pub(super) update_dependents: Option<Vec<Value>>,
    pub(super) readme_component: Option<Value>,
    pub(super) is_merged: Option<bool>,
    /// The Lane's `log` and hash; absent for main.
    pub(super) lane: Option<(Value, String)>,
}

impl LaneData {
    pub(super) fn is_main(&self) -> bool {
        self.lane.is_none()
    }

    /// `laneIdStr`: main's name, or `scope/name` with a differing alias.
    pub(super) fn label(&self) -> String {
        let name = self.id["name"].as_str().unwrap_or_default();
        if self.is_main() {
            return name.to_string();
        }
        let id = format!("{}/{name}", self.id["scope"].as_str().unwrap_or_default());
        match &self.alias {
            Some(alias) => format!("{id} ({alias})"),
            None => id,
        }
    }

    pub(super) fn json(&self) -> Value {
        let mut data = Map::new();
        data.insert("name".into(), self.id["name"].clone());
        let remote = self.lane
            .as_ref()
            .map(|_| {
                format!(
                    "{}/{}",
                    self.id["scope"].as_str().unwrap_or_default(),
                    self.id["name"].as_str().unwrap_or_default(),
                )
            });
        data.insert("remote".into(), json!(remote));
        data.insert("id".into(), self.id.clone());
        if !self.is_main() {
            data.insert("alias".into(), json!(self.alias));
        }
        data.insert("components".into(), json!(self.components));
        if let Some(updates) = &self.update_dependents {
            data.insert("updateDependents".into(), json!(updates));
        }
        if let Some(readme) = &self.readme_component {
            data.insert("readmeComponent".into(), readme.clone());
        }
        if let Some((log, _)) = &self.lane {
            data.insert("log".into(), log.clone());
        }
        data.insert("isMerged".into(), json!(self.is_merged));
        let hash = self.lane.as_ref().map_or("", |(_, hash)| hash.as_str());
        data.insert("hash".into(), json!(hash));
        Value::Object(data)
    }
}

/// `args` starts after `list`.
pub(super) fn run(args: &[OsString], list_args: &[&str]) -> io::Result<Outcome> {
    run_with_command(args, list_args, "list")
}

/// `bit lane` without a subcommand delegates `report()` to `LaneListCmd` (`LaneCmd` has no `json()`).
pub(super) fn run_default(args: &[OsString], list_args: &[&str]) -> io::Result<Outcome> {
    run_with_command(args, list_args, "lane")
}

fn run_with_command(
    args: &[OsString],
    list_args: &[&str],
    command: &'static str,
) -> io::Result<Outcome> {
    let Some((json, details, merged, remote)) = parse(list_args) else {
        return Ok(Outcome::Declined("lane list flags outside the native grammar".to_string()));
    };
    if command == "lane" && json {
        return Ok(
            Outcome::Declined("lane without subcommand does not implement json".to_string()),
        );
    }
    let scope_root = match super::scope_root::discover() {
        Ok(Some(scope_root)) => scope_root,
        Ok(None) => return Ok(Outcome::Declined("not inside a scope".to_string())),
        Err(error) => return Ok(Outcome::Declined(format!("lane list scope: {error}"))),
    };
    if let Some(scope) = remote {
        return remote::run(&scope_root, args, command, scope, json, details, merged);
    }
    let selection = match read_for_scope(&scope_root.path, scope_root.bare, merged.is_some()) {
        Ok(read) => read,
        Err(error) => return Ok(Outcome::Declined(format!("lane list: {error}"))),
    };
    display_local(&scope_root, args, command, json, details, merged, selection)
}

fn display_local(
    scope_root: &super::scope_root::ScopeRoot,
    args: &[OsString],
    command: &'static str,
    json: bool,
    details: bool,
    merged: Option<bool>,
    (lanes, current): (Vec<LaneData>, (Value, String)),
) -> io::Result<Outcome> {
    let root = &scope_root.path;
    let bare = scope_root.bare;
    if json {
        return emit_json(root, bare, args, &lanes, &current.1);
    }
    let report = Report {
        data: match merged {
            Some(only_merged) => merged::report(&lanes, only_merged, Chalk::detect(args)),
            None => report(&lanes, &current.0, Chalk::detect(args), details),
        },
        code: 0,
        details: None,
    };
    if bare {
        workspace_command::execute_with_scope(root, args, command, &report)
    } else {
        workspace_command::execute_with(root, args, command, &report, |_| Ok(()))
    }
}

fn emit_json(
    root: &Path,
    bare: bool,
    args: &[OsString],
    lanes: &[LaneData],
    current: &str,
) -> io::Result<Outcome> {
    let history = (!bare).then(|| History::start(root, args));
    let data = json!({
        "lanes": lanes.iter().map(LaneData::json).collect::<Vec<_>>(),
        "currentLane": if bare { Value::Null } else { json!(current) },
    });
    // `CommandRunner` writes `JSON.stringify(data, null, 2)` without a newline.
    let mut stdout = io::stdout().lock();
    stdout.write_all(serde_json::to_string_pretty(&data)?.as_bytes())?;
    stdout.flush()?;
    if let Some(history) = history {
        history.end(true);
    }
    Ok(Outcome::Exit(ExitCode::SUCCESS))
}

fn parse<'a>(args: &[&'a str]) -> Option<(bool, bool, Option<bool>, Option<&'a str>)> {
    let (mut json, mut details, mut merged, mut remote) = (false, false, None, None);
    let mut args = args.iter().copied();
    while let Some(arg) = args.next() {
        match arg {
            "--json" | "-j" if !json => json = true,
            "--details" | "-d" if !details => details = true,
            "--merged" if merged.is_none() => merged = Some(true),
            "--not-merged" if merged.is_none() => merged = Some(false),
            "--remote" | "-r" if remote.is_none() => remote = Some(remote_name(args.next())?),
            _ => return None,
        }
    }
    Some((json, details, merged, remote))
}

fn remote_name(name: Option<&str>) -> Option<&str> {
    name.map(str::trim)
        .filter(|name| !name.is_empty() && !name.starts_with('-'))
}

/// The lanes `scope.json` tracks: `localLane` per remote lane.
struct Tracking(Vec<Value>);

impl Tracking {
    fn read(scope: &Value) -> Self {
        Self(
            scope["lanes"]["tracking"]
                .as_array()
                .cloned()
                .unwrap_or_default(),
        )
    }

    /// `getLocalTrackedLaneByRemoteName(name, scope)`.
    fn alias(&self, name: &str, scope: &str) -> Option<String> {
        self.0
            .iter()
            .find(|row| row["remoteLane"] == name && row["remoteScope"] == scope)
            .and_then(|row| row["localLane"].as_str())
            .map(str::to_string)
    }
}

/// The lanes then main, and the current lane's id with
/// `getCurrentLaneNameOrAlias()`.
pub(super) fn read(root: &Path) -> io::Result<(Vec<LaneData>, (Value, String))> {
    read_with_merge(root, false)
}

pub(super) fn read_with_merge(
    root: &Path,
    merge_data: bool,
) -> io::Result<(Vec<LaneData>, (Value, String))> {
    read_for_scope(root, false, merge_data)
}

pub(super) fn read_for_scope(
    root: &Path,
    bare: bool,
    merge_data: bool,
) -> io::Result<(Vec<LaneData>, (Value, String))> {
    let scope = scope_for(root, bare)?;
    let tracking = Tracking::read(&scope);
    let bitmap = if bare { None } else { Some(bitmap::read(root)?) };
    let mut engine = Engine::new()?;
    let listed: Value = engine.request(&json!({"kind": "laneList", "root": root,
            "bareScope":bare, "mergeData": merge_data}))?;
    let mut lanes = array(listed.get("lanes"), "lanes")?
        .iter()
        .map(|row| lane(row, &tracking))
        .collect::<io::Result<Vec<_>>>()?;
    let main_id = json!({"name": "main", "scope": text(scope.get("name"))?});
    lanes.push(LaneData {
        id: main_id.clone(),
        alias: None,
        components: if let Some(bitmap) = &bitmap {
            main_components(&mut engine, root, &bitmap.entries)?
        } else {
            bare_main_components(&mut engine, root)?
        },
        update_dependents: None,
        readme_component: None,
        is_merged: None,
        lane: None,
    });
    let current = bitmap.and_then(|bitmap| bitmap.lane).unwrap_or(main_id);
    Ok((lanes, with_alias(current, &tracking)?))
}

fn scope(root: &Path) -> io::Result<Value> {
    scope_for(root, false)
}

fn scope_for(root: &Path, bare: bool) -> io::Result<Value> {
    let path = if bare { root.to_owned() } else { bit_object_import::scope_path(root) };
    serde_json::from_slice(&fs::read(path.join("scope.json"))?).map_err(io::Error::from)
}

fn bare_main_components(engine: &mut Engine, root: &Path) -> io::Result<Vec<Value>> {
    let listed: Value = engine.request(&json!({"kind":"scopeList", "root":root,
        "bareScope":true}))?;
    let models = array(listed.get("components"), "bare scope models")?;
    Ok(models
        .iter()
        .filter_map(|model| {
            let head = model["head"].as_str()?;
            let identity = format!("{}/{}", model["scope"].as_str()?, model["name"].as_str()?);
            let label = model["versions"]
                .as_object()
                .and_then(|tags| {
                    tags.iter()
                        .find(|(_, hash)| hash.as_str() == Some(head))
                })
                .map_or(head, |(tag, _)| tag.as_str());
            Some(json!({"id":format!("{identity}@{label}"),"head":label}))
        })
        .collect())
}

pub(super) fn read_current(root: &Path) -> io::Result<(Value, String)> {
    let scope = scope(root)?;
    let current =
        bitmap::read(root)?.lane.unwrap_or_else(|| json!({"name":"main","scope":scope["name"]}));
    with_alias(current, &Tracking::read(&scope))
}

fn with_alias(current: Value, tracking: &Tracking) -> io::Result<(Value, String)> {
    let name = text(current.get("name"))?;
    let alias = tracking
        .alias(name, text(current.get("scope"))?)
        .unwrap_or_else(|| name.to_string());
    Ok((current, alias))
}

/// A lane of the index: its id, alias and components that are not deleted.
fn lane(row: &Value, tracking: &Tracking) -> io::Result<LaneData> {
    let value = &row["lane"];
    if value["schema"] != DELETED_DATA_SCHEMA {
        return Err(decline("a lane Node migrates to record deleted components"));
    }
    let name = text(value.get("name"))?;
    let scope = text(value.get("scope"))?;
    let components = array(value.get("components"), "lane components")?
        .iter()
        .filter(|component| component["isDeleted"] != true)
        .map(|component| {
            let id = &component["id"];
            Ok(json!({
                "id": format!("{}/{}", text(id.get("scope"))?, text(id.get("name"))?),
                "head": text(component.get("head"))?,
            }))
        })
        .collect::<io::Result<Vec<_>>>()?;
    let update_dependents = updates(value)?;
    let readme_component = readme(value)?;
    Ok(LaneData {
        id: json!({"name": name, "scope": scope}),
        alias: tracking
            .alias(name, scope)
            .filter(|alias| alias != name),
        components,
        update_dependents,
        readme_component,
        is_merged: row["isMerged"].as_bool(),
        lane: Some((value["log"].clone(), text(row.get("hash"))?.to_string())),
    })
}

/// `getIdsOfDefaultLane()`: the bitmap's ids, a versioned one at its model's
/// head (as a tag when it has one), left out when the model has no head. A
/// component not exported yet is found under its default scope.
fn main_components(
    engine: &mut Engine,
    root: &Path,
    entries: &[bitmap::Entry],
) -> io::Result<Vec<Value>> {
    let listed: Value = engine.request(&json!({"kind": "scopeList", "root": root}))?;
    let models = array(listed.get("components"), "models")?;
    let mut components = Vec::new();
    for entry in entries {
        let Some(_) = &entry.version else {
            components.push(json!({"id": entry.identity, "head": "latest"}));
            continue;
        };
        let model = models
            .iter()
            .find(|model| {
                format!(
                    "{}/{}",
                    model["scope"].as_str().unwrap_or_default(),
                    model["name"].as_str().unwrap_or_default(),
                ) == entry.identity
            })
            .ok_or_else(|| decline("a component without a model"))?;
        let Some(head) = model["head"].as_str() else { continue };
        let label = model["versions"]
            .as_object()
            .and_then(|tags| {
                tags.iter()
                    .find(|(_, hash)| hash.as_str() == Some(head))
            })
            .map_or(head, |(tag, _)| tag.as_str());
        components.push(json!({"id": format!("{}@{label}", entry.identity), "head": label}));
    }
    Ok(components)
}

#[cfg(test)]
mod list_tests;
