//! Wire request structs ([`Serialize`], [`Object`], [`Workspace`], [`Repository`], [`Commit`], [`Owner`], [`Normalization`]) for snapshot object serialization and end-of-line normalization.

use serde::Deserialize;
use std::path::PathBuf;

/// Deserialized `snapshotSerialize` request (`objects`, `stagingDirectory`, `pretty`).
#[derive(Debug, Default, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Serialize {
    pub(super) objects: Vec<Object>,
    pub(super) staging_directory: PathBuf,
    #[serde(default)]
    pub(super) pretty: bool,
}

/// Single snapshot object entry (`type`, optional `hash`, `fields`, `source`, `repository`, or `body`).
#[derive(Debug, Default, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Object {
    #[serde(rename = "type")]
    pub(super) kind: String,
    pub(super) hash: Option<String>,
    pub(super) fields: Option<crate::js_json::Value>,
    pub(super) source: Option<Workspace>,
    pub(super) repository: Option<Repository>,
    pub(super) body: Option<String>,
}

/// Workspace file `path`, raw `hash`, normalized `source_hash`, and [`Normalization`] mode for a `Source` object.
#[derive(Debug, Default, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Workspace {
    pub(super) path: PathBuf,
    pub(super) hash: String,
    pub(super) source_hash: String,
    #[serde(default)]
    pub(super) normalization: Normalization,
}

/// Existing loose repository object reference (`objectsDirectory` and `hash`) for a `Source` object.
#[derive(Debug, Default, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Repository {
    pub(super) objects_directory: PathBuf,
    pub(super) hash: String,
}

/// Deserialized `snapshotCommit` request (`token`, `objectsDirectory`, optional `owner`).
#[derive(Debug, Default, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Commit {
    #[serde(deserialize_with = "deserialize_token")]
    pub(super) token: String,
    pub(super) objects_directory: PathBuf,
    pub(super) owner: Option<Owner>,
}

/// Deserializes and validates a non-empty snapshot staging `token` for [`Commit`] without path-traversal characters.
#[inline]
fn deserialize_token<'de, Deser>(deserializer: Deser) -> Result<String, Deser::Error>
where
    Deser: serde::Deserializer<'de>,
{
    let token = String::deserialize(deserializer)?;
    let trimmed = token.trim();
    if trimmed.is_empty()
        || trimmed.len() > 256
        || trimmed.contains(['/', '\\', '\0'])
        || trimmed.contains("..")
    {
        return Err(serde::de::Error::custom("invalid snapshot token"));
    }
    Ok(if trimmed.len() == token.len() { token } else { trimmed.to_owned() })
}

/// Optional POSIX `(uid, gid)` ownership applied when committing staged snapshot objects.
#[derive(Debug, Default, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct Owner {
    pub(super) uid: u32,
    pub(super) gid: u32,
}

/// BOM and end-of-line normalization mode (`Workspace` or `LinuxEol`) for `Source` inputs.
#[derive(Debug, Default, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) enum Normalization {
    #[default]
    Workspace,
    LinuxEol,
}
