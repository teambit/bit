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
        let (path, version) = match text.rsplit_once('@') {
            Some((path, version)) if !path.is_empty() => (path, Some(version.to_string())),
            _ => (text, None),
        };
        let (scope, name) = path
            .split_once('/')
            .ok_or_else(|| invalid(&format!("invalid component id {text}")))?;
        Ok(Self {
            scope: scope.to_string(),
            name: name.to_string(),
            version: version.filter(|version| !version.is_empty()),
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
        .filter(|version| !version.is_empty() && *version != "latest");
    Some(Id {
        scope: scope.to_string(),
        name: name.to_string(),
        version: version.map(str::to_string),
    })
}

fn lane(value: &Value) -> Option<LaneId> {
    let id = &value["id"];
    Some(LaneId {
        scope: id["scope"].as_str()?.to_string(),
        name: id["name"].as_str()?.to_string(),
        exported: value["exported"].as_bool().unwrap_or(false),
    })
}
