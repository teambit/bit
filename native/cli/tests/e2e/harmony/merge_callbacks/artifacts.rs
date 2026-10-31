//! Compare artifact payloads while excluding timestamps and allocation-derived archive digests.
use super::fixture;
use flate2::read::{GzDecoder, ZlibDecoder};
use serde_json::{Value, json};
use std::{fs, io::Read as _, path::Path};

pub(super) fn normalize(root: &Path, version: &mut Value) {
    let Some(builder) = version["extensions"]
        .as_array_mut()
        .unwrap()
        .iter_mut()
        .find(|row| row["name"] == "teambit.pipelines/builder")
    else {
        return;
    };
    if builder["data"].get("pipeline").is_none() {
        assert!(builder["data"]["plannedTasks"].is_array());
        assert!(builder["data"].get("artifacts").is_none());
        return;
    }
    for task in builder["data"]["pipeline"].as_array_mut().unwrap() {
        task.as_object_mut()
            .unwrap()
            .remove("startTime");
        task.as_object_mut()
            .unwrap()
            .remove("endTime");
    }
    let package = artifacts(root, builder);
    if let Some(package) = package {
        for row in builder["data"]["aspectsData"].as_array_mut().unwrap() {
            if row["aspectId"] == "teambit.pkg/pkg" {
                row["data"]["checksum"] = package.clone();
                row["data"]["integrity"] = package.clone();
            }
        }
    }
}
fn source(root: &Path, hash: &str) -> Vec<u8> {
    let file = bit_object_import::scope_path(root)
        .join("objects")
        .join(&hash[..2])
        .join(&hash[2..]);
    let mut bytes = Vec::new();
    ZlibDecoder::new(fs::File::open(file).unwrap()).read_to_end(&mut bytes).unwrap();
    let start = bytes
        .iter()
        .position(|byte| *byte == 0)
        .unwrap()
        + 1;
    assert!(bytes.starts_with(b"Source "));
    bytes[start..].to_vec()
}
fn archive(root: &Path, bytes: &[u8]) -> Value {
    let mut tar = Vec::new();
    GzDecoder::new(bytes).read_to_end(&mut tar).unwrap();
    let mut offset = 0;
    let mut entries = Vec::new();
    while offset + 512 <= tar.len() && tar[offset] != 0 {
        let header = &tar[offset..offset + 512];
        let size = usize::from_str_radix(
            std::str::from_utf8(&header[124..136])
                .unwrap()
                .trim_matches(['\0', ' ']),
            8,
        )
        .unwrap();
        let path = std::str::from_utf8(&header[..100]).unwrap().trim_end_matches('\0');
        let contents = std::str::from_utf8(&tar[offset + 512..offset + 512 + size]).unwrap();
        entries.push(json!({"path":fixture::allocated(path,root),"contents":fixture::allocated(contents,root)}));
        offset += 512 + size.div_ceil(512) * 512;
    }
    json!(entries)
}

fn artifacts(root: &Path, builder: &mut Value) -> Option<Value> {
    let mut package = None;
    for artifact in builder["data"]["artifacts"].as_array_mut().unwrap() {
        for file in artifact["files"].as_array_mut().unwrap() {
            let bytes = source(root, file["file"].as_str().unwrap());
            let data = if file["relativePath"]
                .as_str()
                .unwrap()
                .ends_with(".tgz")
            {
                let archive = archive(root, &bytes);
                package = Some(archive.clone());
                archive
            } else {
                json!(fixture::allocated(&String::from_utf8(bytes).unwrap(), root))
            };
            file["file"] = data;
        }
    }
    package
}
