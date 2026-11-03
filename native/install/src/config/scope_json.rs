//! `<scope>/scope.json` model ([`ScopeJson`]) and loader for local scope settings and lane tracking.
//!
//! Reads remote scope mappings, [`Lanes`] ([`TrackLane`]), and scope-level configuration overrides at [`scope_path`].

pub use bit_workspace_config::scope_path;

use indexmap::IndexMap;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{fs, io, path::Path};

/// A lane tracked against a remote lane (`scope.json` [`Lanes`] `tracking`).
#[derive(Debug, Default, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrackLane {
    pub local_lane: String,
    pub remote_lane: String,
    pub remote_scope: String,
}

/// Lane tracking ([`TrackLane`]) and new-lane lists persisted under `lanes` in `scope.json` ([`ScopeJson`]).
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

/// Deserialize an optional JSON map into trimmed `String` key-value pairs via [`super::workspace_config::config_string`].
fn strings<'de, Source: serde::Deserializer<'de>>(
    deserializer: Source,
) -> Result<IndexMap<String, String>, Source::Error> {
    let map: Option<IndexMap<String, Value>> = Option::deserialize(deserializer)?;
    Ok(map
        .unwrap_or_default()
        .into_iter()
        .filter_map(|(key, value)| {
            let trimmed = key.trim();
            if trimmed.is_empty() {
                return None;
            }
            Some((trimmed.to_owned(), super::workspace_config::config_string(&value)?))
        })
        .collect())
}

impl ScopeJson {
    /// `<scope>/scope.json`; a missing file reads as empty.
    pub fn load(scope: &Path) -> io::Result<Self> {
        let path = scope.join("scope.json");
        match fs::read_to_string(&path) {
            Ok(text) if text.trim().is_empty() => Ok(Self::default()),
            Ok(text) => parse_scope_json(&text)
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

    /// The remote [`TrackLane`] a local lane tracks.
    #[inline]
    #[must_use]
    pub fn tracking(&self, local_lane: &str) -> Option<&TrackLane> {
        let local_lane = local_lane.trim();
        if local_lane.is_empty() {
            return None;
        }
        self.lanes.tracking
            .iter()
            .find(|lane| lane.local_lane.trim() == local_lane)
    }
}

/// Parse `text` (`scope.json`) into [`ScopeJson`] as strict JSON, falling back to `JSONC` when comments or trailing commas are present.
#[inline]
fn parse_scope_json(text: &str) -> io::Result<ScopeJson> {
    if let Ok(parsed) = serde_json::from_str(text) {
        return Ok(parsed);
    }
    let val = crate::jsonc::parse(text)?;
    serde_json::from_value(val).map_err(|error| io::Error::new(io::ErrorKind::InvalidData, error))
}
