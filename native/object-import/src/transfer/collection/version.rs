use std::{io, path::Path};

use serde_json::Value;

use super::{References, Version};
use crate::transfer::{MAX_BYTES, MAX_OBJECTS, invalid, object};

pub(super) struct Loaded {
    pub(super) compressed: Vec<u8>,
    pub(super) references: References,
}

pub(super) fn load(directory: &Path, versions: &[Version]) -> io::Result<Vec<Loaded>> {
    let mut bytes = 0;
    let mut result = Vec::new();
    let mut records = versions.len();
    for version in versions {
        let compressed =
            object::repository(directory, version.hash, MAX_BYTES.saturating_sub(bytes))?;
        bytes = bytes.saturating_add(compressed.len());
        if !crate::metadata::inflate(&compressed).is_some_and(|text| text.starts_with("Version ")) {
            return Err(invalid("transfer manifest is not a Version"));
        }
        let value = object::metadata(&compressed, version.hash)?;
        let references = extract(&value)?;
        records = records
            .saturating_add(references.sources.len())
            .saturating_add(references.artifacts.len())
            .saturating_add(usize::from(references.edges.is_some()))
            .saturating_add(usize::from(references.graph.is_some()));
        if records > MAX_OBJECTS {
            return Err(invalid("transfer references exceed bounds"));
        }
        if version.expected
            .as_ref()
            .is_some_and(|expected| expected != &references)
        {
            return Err(invalid("cached Version reference metadata differs"));
        }
        result.push(Loaded { compressed, references });
    }
    Ok(result)
}

fn extract(value: &Value) -> io::Result<References> {
    let artifacts = artifacts(value)?;
    super::shape::eligible(value)?;
    let files = value
        .get("files")
        .and_then(Value::as_array)
        .ok_or_else(|| invalid("missing Version files"))?;
    let sources = files
        .iter()
        .map(|file| hash(file.get("file")))
        .collect::<io::Result<Vec<_>>>()?;
    Ok(References {
        sources,
        artifacts,
        edges: optional(value, "flattenedEdgesRef")?,
        graph: optional(value, "dependenciesGraphRef")?,
    })
}

fn artifacts(value: &Value) -> io::Result<Vec<[u8; 20]>> {
    let Some(extensions) = value.get("extensions").and_then(Value::as_array) else {
        return Ok(Vec::new());
    };
    let Some(builder) = extensions.iter().find(|entry| is_builder_extension(entry)) else {
        return Ok(Vec::new());
    };
    let Some(artifacts) = builder
        .get("data")
        .and_then(|data| data.get("artifacts"))
        .filter(|value| !value.is_null())
    else {
        return Ok(Vec::new());
    };
    let artifacts = artifacts.as_array().ok_or_else(|| invalid("unsupported builder artifacts"))?;
    let mut result = Vec::new();
    for artifact in artifacts {
        let files = artifact
            .get("files")
            .and_then(Value::as_array)
            .ok_or_else(|| invalid("unsupported artifact files"))?;
        for file in files {
            result.push(hash(file.get("file"))?);
            if result.len() > MAX_OBJECTS {
                return Err(invalid("artifact count exceeds bounds"));
            }
        }
    }
    Ok(result)
}

fn optional(value: &Value, field: &str) -> io::Result<Option<[u8; 20]>> {
    match value.get(field) {
        None | Some(Value::Null) => Ok(None),
        Some(Value::String(text)) if text.trim().is_empty() => Ok(None),
        Some(value) => hash(Some(value)).map(Some),
    }
}

fn is_builder_extension(entry: &Value) -> bool {
    crate::workspace::engine::client_status::config::is_extension_aspect(
        entry,
        "teambit.pipelines/builder",
    ) || entry["id"]
        .as_str()
        .map(str::trim)
        .is_some_and(|id| {
            id == "teambit.pipelines/builder" || id.starts_with("teambit.pipelines/builder@")
        })
}

fn hash(value: Option<&Value>) -> io::Result<[u8; 20]> {
    let text = value
        .and_then(Value::as_str)
        .map(str::trim)
        .ok_or_else(|| invalid("missing transfer ref"))?;
    if text.len() != 40
        || !text
            .bytes()
            .all(|byte| byte.is_ascii_hexdigit() && !byte.is_ascii_uppercase())
    {
        return Err(invalid("unsupported transfer ref"));
    }
    let mut bytes = [0; 20];
    for (index, byte) in bytes.iter_mut().enumerate() {
        *byte = u8::from_str_radix(&text[index * 2..index * 2 + 2], 16).map_err(io::Error::other)?;
    }
    Ok(bytes)
}
