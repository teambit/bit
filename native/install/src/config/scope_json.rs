pub use bit_workspace_config::scope_path;

use indexmap::IndexMap;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{fs, io, path::Path};

/// A lane tracked against a remote lane (`scope.json` `lanes.tracking`).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrackLane {
    pub local_lane: String,
    pub remote_lane: String,
    pub remote_scope: String,
}

#[derive(Debug, Default, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Lanes {
    #[serde(default)]
    pub tracking: Vec<TrackLane>,
    #[serde(default)]
    pub new: Vec<String>,
}

/// `<scope>/scope.json`, the local scope's settings.
#[derive(Debug, Default, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScopeJson {
    #[serde(default)]
    pub name: String,
    pub version: Option<String>,
    /// Remote scope name → URL.
    #[serde(default)]
    pub remotes: IndexMap<String, String>,
    #[serde(default)]
    pub lanes: Lanes,
    /// The scope layer of `bit config`.
    #[serde(default, deserialize_with = "strings")]
    pub config: IndexMap<String, String>,
}

fn strings<'de, Source: serde::Deserializer<'de>>(
    deserializer: Source,
) -> Result<IndexMap<String, String>, Source::Error> {
    let map: Option<IndexMap<String, Value>> = Option::deserialize(deserializer)?;
    Ok(map
        .unwrap_or_default()
        .into_iter()
        .filter_map(|(key, value)| Some((key, super::workspace_config::config_string(&value)?)))
        .collect())
}

impl ScopeJson {
    /// `<scope>/scope.json`; a missing file reads as empty.
    pub fn load(scope: &Path) -> io::Result<Self> {
        let path = scope.join("scope.json");
        match fs::read_to_string(&path) {
            Ok(text) => serde_json::from_str(&text)
                .map_err(|error| {
                    io::Error::new(
                        io::ErrorKind::InvalidData,
                        format!("failed parsing {}: {error}", path.display()),
                    )
                }),
            Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(Self::default()),
            Err(error) => Err(error),
        }
    }

    /// The remote lane a local lane tracks.
    #[must_use]
    pub fn tracking(&self, local_lane: &str) -> Option<&TrackLane> {
        self.lanes.tracking
            .iter()
            .find(|lane| lane.local_lane == local_lane)
    }
}
