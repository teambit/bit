//! Native `bit lane list` and `bit lane list --json` (`LaneListCmd`): the
//! lanes of the local scope (`getLanes({ showDefaultLane: true })`), then
//! main with the workspace's components.
//!
//! `--details`, `--remote`, `--merged`, `--not-merged`, lanes Node would
//! migrate to the schema that records deleted components, and lanes with a
//! readme component or update-dependents run on the Node.js CLI.

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
    workspace,
};
use serde_json::{Map, Value, json};
use std::{
    env,
    ffi::OsString,
    fs,
    io::{self, Write},
    path::Path,
    process::ExitCode,
};

/// The schema of lanes that record their deleted components.
const DELETED_DATA_SCHEMA: &str = "1.0.0";

/// A lane's data, as `serializeLaneData` writes it.
struct LaneData {
    /// `{ name, scope }`.
    id: Value,
    alias: Option<String>,
    components: Vec<Value>,
    /// The Lane's `log` and hash; absent for main.
    lane: Option<(Value, String)>,
}

impl LaneData {
    fn is_main(&self) -> bool {
        self.lane.is_none()
    }

    /// `laneIdStr`: main's name, or `scope/name` with a differing alias.
    fn label(&self) -> String {
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

    fn json(&self) -> Value {
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
        if let Some((log, _)) = &self.lane {
            data.insert("log".into(), log.clone());
        }
        data.insert("isMerged".into(), Value::Null);
        let hash = self.lane.as_ref().map_or("", |(_, hash)| hash.as_str());
        data.insert("hash".into(), json!(hash));
        Value::Object(data)
    }
}

/// `args` starts after `list`.
pub(super) fn run(args: &[OsString], list_args: &[&str]) -> io::Result<Outcome> {
    let json = match list_args {
        [] => false,
        ["--json" | "-j"] => true,
        _ => {
            return Ok(Outcome::Declined("lane list flags outside the native grammar".to_string()));
        }
    };
    let Some(root) = workspace::root(&env::current_dir()?) else {
        return Ok(Outcome::Declined("not inside a workspace".to_string()));
    };
    let (lanes, current) = match read(&root) {
        Ok(read) => read,
        Err(error) => return Ok(Outcome::Declined(format!("lane list: {error}"))),
    };
    if json {
        let history = History::start(&root, args);
        let data = json!({
            "lanes": lanes.iter().map(LaneData::json).collect::<Vec<_>>(),
            "currentLane": current.1,
        });
        // `CommandRunner` writes `JSON.stringify(data, null, 2)` without a newline.
        let mut stdout = io::stdout().lock();
        stdout.write_all(serde_json::to_string_pretty(&data)?.as_bytes())?;
        stdout.flush()?;
        history.end(true);
        return Ok(Outcome::Exit(ExitCode::SUCCESS));
    }
    let report =
        Report { data: report(&lanes, &current.0, Chalk::detect(args)), code: 0, details: None };
    workspace_command::execute_with(&root, args, "list", &report, |_| Ok(()))
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
fn read(root: &Path) -> io::Result<(Vec<LaneData>, (Value, String))> {
    let scope: Value = serde_json::from_slice(&fs::read(root.join(".bit/scope.json"))?)?;
    let tracking = Tracking::read(&scope);
    let bitmap = bitmap::read(root)?;
    let mut engine = Engine::new()?;
    let listed: Value = engine.request(&json!({"kind": "laneList", "root": root}))?;
    let mut lanes = array(listed.get("lanes"), "lanes")?
        .iter()
        .map(|row| lane(row, &tracking))
        .collect::<io::Result<Vec<_>>>()?;
    let main_id = json!({"name": "main", "scope": text(scope.get("name"))?});
    lanes.push(LaneData {
        id: main_id.clone(),
        alias: None,
        components: main_components(&mut engine, root, &bitmap.entries)?,
        lane: None,
    });
    let current = bitmap.lane.unwrap_or(main_id);
    let name = text(current.get("name"))?;
    let alias = tracking
        .alias(name, text(current.get("scope"))?)
        .unwrap_or_else(|| name.to_string());
    Ok((lanes, (current, alias)))
}

/// A lane of the index: its id, alias and components that are not deleted.
fn lane(row: &Value, tracking: &Tracking) -> io::Result<LaneData> {
    let value = &row["lane"];
    if value["schema"] != DELETED_DATA_SCHEMA {
        return Err(decline("a lane Node migrates to record deleted components"));
    }
    if value
        .get("readmeComponent")
        .is_some_and(|readme| !readme.is_null())
        || value
            .get("updateDependents")
            .is_some_and(|ids| !ids.is_null() && ids != &json!([]))
    {
        return Err(decline("a lane with a readme component or update-dependents"));
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
    Ok(LaneData {
        id: json!({"name": name, "scope": scope}),
        alias: tracking
            .alias(name, scope)
            .filter(|alias| alias != name),
        components,
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

/// `LaneListCmd.report` without `--details`.
fn report(lanes: &[LaneData], current: &Value, chalk: Chalk) -> String {
    let format = Formatter::new(chalk);
    let current_lane = lanes
        .iter()
        .find(|lane| lane.id == *current);
    // A current lane missing from the index: `laneIdStr` without an alias.
    let current_label = current_lane.map_or_else(
        || {
            let name = current["name"].as_str().unwrap_or_default();
            format!("{}/{name}", current["scope"].as_str().unwrap_or_default())
        },
        LaneData::label,
    );
    let items: Vec<String> = lanes
        .iter()
        .filter(|lane| lane.id != *current)
        .map(|lane| {
            format.item(&format!(
                "{} ({} components)",
                chalk.green(&lane.label()),
                lane.components.len(),
            ))
        })
        .collect();
    let hints = "use 'bit lane list --details' or 'bit lane show <lane-name>' for more info\nswitch lanes using 'bit switch <name>'. create lanes using 'bit lane create <name>'";
    Formatter::join(&[
        format!("current lane - {}", chalk.green(&current_label)),
        format.section("available lanes", "", &items),
        format.hint(hints),
    ])
}

#[cfg(test)]
mod list_tests;
