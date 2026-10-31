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
    preserve_order: bool,
) -> io::Result<()> {
    let mut files = Vec::new();
    for file in &material.files {
        let (row, source) = capture_file(version, file, snapshots)?;
        files.push(row);
        objects.push(source);
    }
    if !preserve_order {
        files.sort_by(|left, right| {
            left["relativePath"]
                .as_str()
                .unwrap_or_default()
                .encode_utf16()
                .cmp(
                    right["relativePath"]
                        .as_str()
                        .unwrap_or_default()
                        .encode_utf16(),
                )
        });
    }
    version["files"] = json!(files);
    Ok(())
}

pub(in crate::workspace::engine::command) fn capture_file(
    version: &Value,
    file: &Value,
    snapshots: &snapshots::State,
) -> io::Result<(Value, Value)> {
    let relative = file["relativePath"].as_str().ok_or_else(|| invalid("resolve file path"))?;
    let observation = observation(file, snapshots)?;
    let bytes = observation.contents.as_ref();
    let bytes = if bytes.starts_with(&[239, 187, 191]) { &bytes[3..] } else { bytes };
    let bytes = if file["bitmapSource"] == true {
        crate::inspection::normalize_bitmap(bytes)?
    } else {
        bytes.to_vec()
    };
    let normalized = crate::checkout::eol::normalize(bytes, false);
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
