//! Wire request validation and parsing ([`collect`]) for `transferCollect`, `transferPlan`, and `transferArchive`.

use serde::Deserialize;
use std::path::PathBuf;

use super::super::{collection, invalid};

pub(super) fn collect(input: &serde_json::Value) -> std::io::Result<Collect> {
    let fields = input.as_object().ok_or_else(|| invalid("invalid collection request"))?;
    if fields
        .keys()
        .any(|key| {
            !matches!(
                key.as_str(),
                "mode"
                    | "objectsDirectory"
                    | "versions"
                    | "scope"
                    | "stagingDirectory"
                    | "refs"
                    | "throwForMissingLocalArtifacts"
                    | "includeArtifacts"
                    | "gracefulMissing",
            )
        })
    {
        return Err(invalid("unknown collection field"));
    }
    let mut request: Collect =
        serde::Deserialize::deserialize(input).map_err(std::io::Error::other)?;
    if request.mode.len() != request.mode.trim().len() {
        request.mode = request.mode.trim().to_owned();
    }
    if request.versions.len() > super::super::MAX_OBJECTS
        || request.refs.len() > super::super::MAX_OBJECTS
    {
        return Err(invalid("collection object count exceeds bounds"));
    }
    request.scope = request.scope
        .as_deref()
        .map(str::trim)
        .filter(|scope| !scope.is_empty())
        .map(str::to_owned);
    Ok(request)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct Collect {
    pub(super) mode: String,
    pub(super) objects_directory: PathBuf,
    #[serde(default)]
    pub(super) versions: Vec<Version>,
    pub(super) scope: Option<String>,
    pub(super) staging_directory: PathBuf,
    #[serde(default)]
    pub(super) refs: Vec<String>,
    #[serde(flatten)]
    pub(super) options: Options,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Options {
    #[serde(default)]
    pub(super) throw_for_missing_local_artifacts: bool,
    #[serde(default)]
    pub(super) include_artifacts: bool,
    #[serde(default)]
    pub(super) graceful_missing: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Version {
    hash: String,
    locally_changed: bool,
    expected: Option<References>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct References {
    sources: Vec<String>,
    artifacts: Vec<String>,
    edges: Option<String>,
    graph: Option<String>,
}

impl Version {
    #[inline]
    pub(super) fn convert(&self) -> std::io::Result<collection::Version> {
        let expected = self.expected
            .as_ref()
            .map(References::convert)
            .transpose()?;
        Ok(collection::Version {
            hash: crate::merge_history::hash(self.hash.trim())?,
            locally_changed: self.locally_changed,
            expected,
        })
    }
}

impl References {
    fn convert(&self) -> std::io::Result<collection::References> {
        if self.sources.len() > super::super::MAX_OBJECTS
            || self.artifacts.len() > super::super::MAX_OBJECTS
        {
            return Err(invalid("collection reference count limit"));
        }
        Ok(collection::References {
            sources: self.sources
                .iter()
                .map(|text| crate::merge_history::hash(text.trim()))
                .collect::<std::io::Result<_>>()?,
            artifacts: self.artifacts
                .iter()
                .map(|text| crate::merge_history::hash(text.trim()))
                .collect::<std::io::Result<_>>()?,
            edges: self.edges
                .as_deref()
                .map(str::trim)
                .filter(|text| !text.is_empty())
                .map(crate::merge_history::hash)
                .transpose()?,
            graph: self.graph
                .as_deref()
                .map(str::trim)
                .filter(|text| !text.is_empty())
                .map(crate::merge_history::hash)
                .transpose()?,
        })
    }
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct Initialize {
    pub(super) objects: Vec<Fragment>,
}

#[derive(Deserialize)]
#[serde(untagged)]
pub(super) enum Fragment {
    Collection(Reference),
    Metadata { metadata: Metadata },
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Reference {
    pub(super) collection_token: String,
    pub(super) index: usize,
    pub(super) scope: Option<String>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct Metadata {
    pub(super) hash: String,
    pub(super) scope: Option<String>,
    #[serde(rename = "type")]
    pub(super) kind: Option<String>,
    pub(super) compressed: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Archive {
    pub(super) token: String,
    pub(super) path: PathBuf,
    pub(super) mtime_seconds: Vec<u32>,
    pub(super) mode: Option<String>,
    pub(super) scope_name: Option<String>,
}

pub(super) fn hexadecimal(text: &str) -> std::io::Result<Vec<u8>> {
    let text = text.trim();
    if text.is_empty() || !text.len().is_multiple_of(2) || text.len() > super::super::MAX_BYTES * 2
    {
        return Err(invalid("invalid compressed metadata encoding"));
    }
    text.as_bytes()
        .chunks_exact(2)
        .map(|chunk| Ok((hex_digit(chunk[0])? << 4) | hex_digit(chunk[1])?))
        .collect()
}

#[inline]
fn hex_digit(byte: u8) -> std::io::Result<u8> {
    match byte {
        b'0'..=b'9' => Ok(byte - b'0'),
        b'a'..=b'f' => Ok(byte - b'a' + 10),
        b'A'..=b'F' => Ok(byte - b'A' + 10),
        _ => Err(invalid("invalid compressed metadata encoding")),
    }
}
