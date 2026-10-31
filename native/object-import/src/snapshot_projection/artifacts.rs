use super::{get, invalid, object};
use crate::js_json::Value;
use std::io;

pub(super) fn convert(data: &Value) -> io::Result<Value> {
    let artifacts = get(data, "artifacts");
    if !artifacts.truthy()? {
        return Ok(data.clone());
    }
    let Value::Array(artifacts) = artifacts else {
        return Err(invalid("snapshot builder artifacts array"));
    };
    if artifacts.len() > 4096 {
        return Err(invalid("snapshot builder artifacts budget"));
    }
    let artifacts = artifacts
        .iter()
        .map(artifact)
        .collect::<io::Result<Vec<_>>>()?;
    replace(data, "artifacts", &Value::Array(artifacts))
}
fn artifact(artifact: &Value) -> io::Result<Value> {
    let files = get(artifact, "files");
    if !matches!(get(files, "snapshotArtifactFiles"), Value::Boolean(true)) {
        return Err(invalid("snapshot ArtifactFiles class projection required"));
    }
    let Value::Array(refs) = get(files, "refs") else {
        return Err(invalid("snapshot artifact refs array"));
    };
    if refs.len() > 4096 {
        return Err(invalid("snapshot artifact refs budget"));
    }
    let refs = refs
        .iter()
        .map(reference)
        .collect::<io::Result<Vec<_>>>()?;
    replace(artifact, "files", &Value::Array(refs))
}
fn reference(reference: &Value) -> io::Result<Value> {
    object(reference)?;
    let mut fields = Vec::new();
    for (name, source) in [("relativePath", "relativePath"), ("file", "ref"), ("url", "url")] {
        fields.push((name.encode_utf16().collect(), get(reference, source).clone()));
    }
    Ok(Value::Object(fields))
}
fn replace(value: &Value, name: &str, replacement: &Value) -> io::Result<Value> {
    object(value)?;
    let Value::Object(fields) = value else { unreachable!() };
    let key: Vec<_> = name.encode_utf16().collect();
    Ok(Value::Object(
        fields
            .iter()
            .map(|(name, value)| {
                (name.clone(), if *name == key { replacement.clone() } else { value.clone() })
            })
            .collect(),
    ))
}
