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
    serde::Deserialize::deserialize(input).map_err(std::io::Error::other)
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
    pub(super) fn convert(&self) -> std::io::Result<collection::Version> {
        let expected = self.expected
            .as_ref()
            .map(References::convert)
            .transpose()?;
        Ok(collection::Version {
            hash: crate::merge_history::hash(&self.hash)?,
            locally_changed: self.locally_changed,
            expected,
        })
    }
}

impl References {
    fn convert(&self) -> std::io::Result<collection::References> {
        Ok(collection::References {
            sources: self.sources
                .iter()
                .map(|text| crate::merge_history::hash(text))
                .collect::<std::io::Result<_>>()?,
            artifacts: self.artifacts
                .iter()
                .map(|text| crate::merge_history::hash(text))
                .collect::<std::io::Result<_>>()?,
            edges: self.edges
                .as_deref()
                .map(crate::merge_history::hash)
                .transpose()?,
            graph: self.graph
                .as_deref()
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
    if !text.len().is_multiple_of(2)
        || text.len() > super::super::MAX_BYTES * 2
        || !text.bytes().all(|byte| byte.is_ascii_hexdigit())
    {
        return Err(invalid("invalid compressed metadata encoding"));
    }
    text.as_bytes()
        .chunks_exact(2)
        .map(|chunk| {
            let text = std::str::from_utf8(chunk).map_err(std::io::Error::other)?;
            u8::from_str_radix(text, 16).map_err(std::io::Error::other)
        })
        .collect()
}
