//! The component ids an import needs, from `.bitmap`.

use super::objects::invalid;
use serde_json::Value;
use std::{fs, io, path::Path};

const LANE_KEY: &str = "_bit_lane";

/// An exported component id with its `.bitmap` version.
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct Id {
    pub scope: String,
    pub name: String,
    /// Tag or snap hash; `None` asks for the head.
    pub version: Option<String>,
}

impl Id {
    #[must_use]
    pub fn without_version(&self) -> String {
        format!("{}/{}", self.scope, self.name)
    }

    /// `scope/name@version`, as the fetch protocol expects.
    #[must_use]
    pub fn to_request(&self) -> String {
        match &self.version {
            Some(version) => format!("{}@{version}", self.without_version()),
            None => self.without_version(),
        }
    }

    #[must_use]
    pub fn with_version(&self, version: Option<String>) -> Self {
        Self { version, ..self.clone() }
    }

    /// Parse `scope/name[@version]` where `name` may contain `/`.
    pub fn parse(text: &str) -> io::Result<Self> {
        let trimmed = text.trim();
        let (path, version) = match trimmed.rsplit_once('@') {
            Some((path, version)) if !path.trim().is_empty() => {
                (path.trim(), Some(version.trim().to_string()))
            }
            _ => (trimmed, None),
        };
        let (scope, name) = path
            .split_once('/')
            .map(|(scope, name)| (scope.trim(), name.trim()))
            .filter(|(scope, name)| !scope.is_empty() && !name.is_empty())
            .ok_or_else(|| invalid(&format!("invalid component id {text}")))?;
        Ok(Self {
            scope: scope.to_string(),
            name: name.to_string(),
            version: version.filter(|version| {
                !version.is_empty() && !matches!(version.as_str(), "latest" | "head")
            }),
        })
    }
}

/// The lane `.bitmap` says the workspace is on.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LaneId {
    pub scope: String,
    pub name: String,
    pub exported: bool,
}

impl LaneId {
    #[must_use]
    pub fn to_request(&self) -> String {
        format!("{}/{}", self.scope, self.name)
    }
}

/// The parts of `.bitmap` the import reads.
#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub struct Bitmap {
    /// All exported ids (`getAllBitIdsFromAllLanes`, filtered by `hasScope`).
    pub ids: Vec<Id>,
    /// Exported ids available on the current lane (`getAllBitIds`).
    pub current_lane_ids: Vec<Id>,
    pub lane: Option<LaneId>,
}

/// Read `<root>/.bitmap`. A missing file has no components.
pub fn read(root: &Path) -> io::Result<Bitmap> {
    let bytes = match fs::read(root.join(".bitmap")) {
        Ok(bytes) => bytes,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(Bitmap::default()),
        Err(error) => return Err(error),
    };
    let document = bit_object_import::parse_jsonc(&bytes)?;
    let entries = document.as_object().ok_or_else(|| invalid("invalid .bitmap"))?;
    let mut bitmap = Bitmap { lane: entries.get(LANE_KEY).and_then(lane), ..Bitmap::default() };
    for (key, entry) in entries {
        if key.starts_with('$') || key == LANE_KEY || key == "version" {
            continue;
        }
        let Some(id) = exported_id(key, entry) else { continue };
        if entry["isAvailableOnCurrentLane"].as_bool() != Some(false) {
            bitmap.current_lane_ids.push(id.clone());
        }
        bitmap.ids.push(id);
    }
    Ok(bitmap)
}

fn exported_id(key: &str, entry: &Value) -> Option<Id> {
    let bare = key.split('@').next().unwrap_or(key);
    let entry_name = entry["name"]
        .as_str()
        .filter(|val| !val.is_empty());
    let (scope, name) = if let Some(scope) = entry["scope"]
        .as_str()
        .filter(|val| !val.is_empty())
    {
        let fallback = bare
            .strip_prefix(scope)
            .and_then(|rest| rest.strip_prefix('/'))
            .unwrap_or(bare);
        (scope, entry_name.unwrap_or(fallback))
    } else if entry.get("scope").is_none()
        && entry["defaultScope"]
            .as_str()
            .unwrap_or_default()
            .is_empty()
    {
        let (key_scope, key_name) = bare.split_once('/')?;
        if key_scope.is_empty() || key_name.is_empty() {
            return None;
        }
        (key_scope, entry_name.unwrap_or(key_name))
    } else {
        return None;
    };
    let version = entry["version"]
        .as_str()
        .filter(|val| !val.is_empty())
        .or_else(|| key.split_once('@').map(|(_, ver)| ver))
        .filter(|version| !version.is_empty() && !matches!(*version, "latest" | "head"));
    Some(Id {
        scope: scope.to_string(),
        name: name.to_string(),
        version: version.map(str::to_string),
    })
}

fn lane(value: &Value) -> Option<LaneId> {
    let id = &value["id"];
    let (scope, name) = if let Some(raw) = id
        .as_str()
        .map(str::trim)
        .filter(|raw| !raw.is_empty())
        .or_else(|| {
            value
                .as_str()
                .map(str::trim)
                .filter(|raw| !raw.is_empty())
        }) {
        raw.split_once('/')?
    } else {
        (id["scope"].as_str()?, id["name"].as_str()?)
    };
    let trimmed_scope = scope.trim();
    let trimmed_name = name.trim();
    (!trimmed_scope.is_empty() && !trimmed_name.is_empty()).then(|| LaneId {
        scope: trimmed_scope.to_string(),
        name: trimmed_name.to_string(),
        exported: value["exported"].as_bool().unwrap_or(false),
    })
}
