use super::{Material, invalid};
use crate::workspace::snapshots;
use serde_json::{Value, json};
use sha1::{Digest, Sha1};
use std::{io, path::Path};

pub(super) fn sources(
    version: &mut Value,
    material: &Material,
    snapshots: &snapshots::State,
    objects: &mut Vec<Value>,
) -> io::Result<()> {
    let mut files = Vec::new();
    for file in &material.files {
        let (row, source) = capture_file(version, file, snapshots)?;
        files.push(row);
        objects.push(source);
    }
    files.sort_by(|a, b| {
        a["relativePath"]
            .as_str()
            .unwrap()
            .encode_utf16()
            .cmp(
                b["relativePath"]
                    .as_str()
                    .unwrap()
                    .encode_utf16(),
            )
    });
    version["files"] = json!(files);
    Ok(())
}

fn capture_file(
    version: &Value,
    file: &Value,
    snapshots: &snapshots::State,
) -> io::Result<(Value, Value)> {
    let relative = file["relativePath"].as_str().ok_or_else(|| invalid("resolve file path"))?;
    let observation = observation(file, snapshots)?;
    let bytes = observation.contents.as_ref();
    let bytes = if bytes.starts_with(&[239, 187, 191]) { &bytes[3..] } else { bytes };
    let normalized = crate::checkout::eol::normalize(bytes.to_vec(), false);
    let digest = crate::validate::hexadecimal(&Sha1::digest(&normalized));
    let test = version["files"]
        .as_array()
        .and_then(|rows| {
            rows.iter()
                .find(|row| row["relativePath"] == relative)
        })
        .map(|row| row["test"].clone())
        .unwrap_or(json!(false));
    let row = json!({"file":digest,"relativePath":relative,"name":relative.rsplit('/').next(),"test":test});
    let source =
        json!({"type":"Source","hash":digest,"body":crate::validate::hexadecimal(&normalized)});
    Ok((row, source))
}

fn observation<'a>(
    file: &Value,
    snapshots: &'a snapshots::State,
) -> io::Result<&'a snapshots::Observation> {
    let path = file["path"].as_str().ok_or_else(|| invalid("resolve capture path"))?;
    let raw = file["rawHash"].as_str().ok_or_else(|| invalid("resolve capture hash"))?;
    let token = file["readToken"].as_u64().ok_or_else(|| invalid("resolve capture token"))?;
    let observed = snapshots
        .get(token, Path::new(path), raw)
        .ok_or_else(|| invalid("resolve lost capture"))?;
    if observed.snapshot_hash != file["snapshotHash"] {
        return Err(invalid("resolve capture content"));
    }
    Ok(observed)
}
