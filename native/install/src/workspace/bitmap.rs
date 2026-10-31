//! `.bitmap` (`BitMap.loadFromContentWithoutLoadingFiles`).

use crate::{jsonc, model::ComponentId};
use serde_json::{Map, Value};
use std::{
    collections::HashSet,
    fs, io,
    path::{Path, PathBuf},
};

pub const BITMAP: &str = ".bitmap";
const OLD_BITMAP: &str = ".bit.map.json";
const SCHEMA_FIELD: &str = "$schema-version";
const LANE_KEY: &str = "_bit_lane";
const REMOVE_ASPECT: &str = "teambit.component/remove";
/// The root dir of the component that owns the workspace root.
pub const WORKSPACE_ROOT_DIR: &str = ".";

/// The lane the workspace is on (`_bit_lane`).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LaneInfo {
    pub scope: String,
    pub name: String,
    pub exported: bool,
}

impl LaneInfo {
    /// `scope/name`, as `LaneId.toString()` prints it.
    #[must_use]
    pub fn id(&self) -> String {
        format!("{}/{}", self.scope, self.name)
    }
}

/// One `.bitmap` entry (`ComponentMap`).
#[derive(Debug, Clone, PartialEq)]
pub struct BitmapEntry {
    /// The entry's key in `.bitmap`.
    pub key: String,
    pub id: ComponentId,
    pub main_file: String,
    /// `/`-separated, relative to the workspace; `.` for the workspace root.
    pub root_dir: String,
    /// The entry's `config`: aspect id → config or `"-"`.
    pub config: Option<Map<String, Value>>,
    pub lanes: LaneFlags,
    pub next_version: Option<Value>,
}

/// How an entry relates to lanes.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct LaneFlags {
    /// `onLanesOnly`: the component exists only on lanes, not on main.
    pub on_lanes_only: bool,
    /// `localOnly`: never exported.
    pub local_only: bool,
    /// `isAvailableOnCurrentLane`, `true` unless written.
    pub available_on_current_lane: bool,
}

impl BitmapEntry {
    /// `isRemoved()`: soft-removed with `bit remove`.
    #[must_use]
    pub fn is_removed(&self) -> bool {
        let Some(remove) = self.config
            .as_ref()
            .and_then(|config| {
                config
                    .get(REMOVE_ASPECT)
                    .or_else(|| {
                        config
                            .iter()
                            .find_map(|(key, value)| {
                                (crate::config::aspect_id_without_version(key) == REMOVE_ASPECT)
                                    .then_some(value)
                            })
                    })
            })
        else {
            return false;
        };
        remove.get("removed").is_some_and(crate::config::truthy)
    }

    /// Owns its directory now: available on the current lane and not removed.
    #[must_use]
    pub fn owns_its_dir(&self) -> bool {
        self.lanes.available_on_current_lane && !self.is_removed()
    }
}

#[derive(Debug, Default, Clone, PartialEq)]
pub struct Bitmap {
    pub path: Option<PathBuf>,
    pub schema: Option<String>,
    pub lane: Option<LaneInfo>,
    pub entries: Vec<BitmapEntry>,
}

/// `.bitmap`, or the legacy `.bit.map.json`.
fn location(root: &Path) -> Option<PathBuf> {
    [BITMAP, OLD_BITMAP]
        .iter()
        .map(|name| root.join(name))
        .find(|path| path.exists())
}

fn invalid(path: &Path, message: &str) -> io::Error {
    io::Error::new(
        io::ErrorKind::InvalidData,
        format!("invalid bitmap at {}: {message}", path.display()),
    )
}

impl Bitmap {
    /// A missing `.bitmap` is an empty workspace.
    pub fn load(root: &Path, default_scope: Option<&str>) -> io::Result<Self> {
        let Some(path) = location(root) else { return Ok(Self::default()) };
        let text = fs::read_to_string(&path)?;
        let value = jsonc::parse(&text).map_err(|error| invalid(&path, &error.to_string()))?;
        Self::projected(&path, &value, default_scope)
    }

    /// Read a retained in-memory bitmap without publishing it to disk.
    pub fn projected(path: &Path, value: &Value, default_scope: Option<&str>) -> io::Result<Self> {
        let Value::Object(mut json) = value.clone() else {
            return Err(invalid(path, "not an object"));
        };
        let schema = json
            .remove(SCHEMA_FIELD)
            .or_else(|| json.remove("version"))
            .and_then(|schema| schema.as_str().map(str::to_owned));
        let lane = json.remove(LANE_KEY).and_then(|lane| lane_info(&lane));
        throw_for_duplicate_root_dirs(path, &json)?;
        let entries = json
            .iter()
            .map(|(key, value)| entry(path, key, value, default_scope))
            .collect::<io::Result<Vec<_>>>()?;
        Ok(Self { path: Some(path.to_owned()), schema, lane, entries })
    }
}

fn lane_info(lane: &Value) -> Option<LaneInfo> {
    let id = lane.get("id")?;
    Some(LaneInfo {
        scope: id.get("scope")?.as_str()?.to_owned(),
        name: id.get("name")?.as_str()?.to_owned(),
        exported: lane.get("exported").is_some_and(crate::config::truthy),
    })
}

fn throw_for_duplicate_root_dirs(path: &Path, json: &Map<String, Value>) -> io::Result<()> {
    let mut seen = HashSet::new();
    for (key, value) in json {
        let Some(root_dir) = value.get("rootDir").and_then(Value::as_str) else {
            continue;
        };
        if !seen.insert(root_dir) {
            return Err(invalid(
                path,
                &format!(r#"rootDir "{root_dir}" of "{key}" is used by another component"#),
            ));
        }
    }
    Ok(())
}

fn string(value: &Value, field: &str) -> Option<String> {
    value
        .get(field)
        .and_then(Value::as_str)
        .filter(|text| !text.is_empty())
        .map(str::to_owned)
}

fn component_id(
    path: &Path,
    key: &str,
    value: &Value,
    default_scope: Option<&str>,
) -> io::Result<ComponentId> {
    if value.get("scope").is_none() {
        return Err(invalid(
            path,
            &format!(r#".bitmap entry for {key} is missing "scope" property"#),
        ));
    }
    let scope = string(value, "scope");
    let version = string(value, "version");
    if scope.is_some() && version.is_none() {
        return Err(invalid(
            path,
            &format!(r#".bitmap entry of "{key}" has a scope-name but no version"#),
        ));
    }
    // Before schema 17 the default scope was not written when it was the workspace's.
    let default_scope = string(value, "defaultScope")
        .or_else(|| {
            scope
                .is_none()
                .then(|| default_scope.map(str::to_owned))
                .flatten()
        });
    Ok(ComponentId {
        scope,
        default_scope,
        name: string(value, "name").unwrap_or_else(|| key.to_owned()),
        version,
    })
}

fn entry(
    path: &Path,
    key: &str,
    value: &Value,
    default_scope: Option<&str>,
) -> io::Result<BitmapEntry> {
    let flag = |field: &str| value.get(field).is_some_and(crate::config::truthy);
    Ok(BitmapEntry {
        key: key.to_owned(),
        id: component_id(path, key, value, default_scope)?,
        main_file: string(value, "mainFile").unwrap_or_default(),
        root_dir: string(value, "rootDir").unwrap_or_default(),
        config: value
            .get("config")
            .and_then(Value::as_object)
            .cloned(),
        lanes: LaneFlags {
            on_lanes_only: flag("onLanesOnly"),
            local_only: flag("localOnly"),
            available_on_current_lane: value
                .get("isAvailableOnCurrentLane")
                .is_none_or(crate::config::truthy),
        },
        next_version: value
            .get("nextVersion")
            .filter(|next| !next.is_null())
            .cloned(),
    })
}
