//! Root metadata written by `IsolatorMain` for workspace capsules.

use super::super::object_hash_short;
use chrono::{SecondsFormat, Utc};
use serde::Serialize;
use std::{fs, io, path::Path, time::SystemTime};

#[derive(Serialize)]
struct RootPackage<'a> {
    name: &'a str,
    #[serde(rename = "bit-capsule")]
    bit_capsule: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct OriginMarker<'a> {
    origin_path: &'a str,
    created_at: &'a str,
    kind: &'static str,
}

pub(super) fn write_root_metadata(capsules_root: &Path, base_dir: &str) -> io::Result<()> {
    fs::create_dir_all(capsules_root)?;
    let package = capsules_root.join("package.json");
    if !package.exists() {
        let name = format!("capsules-{}", object_hash_short(base_dir));
        let content = serde_json::to_string(&RootPackage { name: &name, bit_capsule: true })?;
        fs::write(package, format!("{content}\n"))?;
    }
    let marker = capsules_root.join(".bit-capsule-origin.json");
    if marker.exists() {
        if let Ok(file) = fs::OpenOptions::new().write(true).open(&marker) {
            let _ = file.set_modified(SystemTime::now());
        }
    } else {
        let created_at = Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true);
        let content = serde_json::to_string(&OriginMarker {
            origin_path: base_dir,
            created_at: &created_at,
            kind: "workspace",
        })?;
        let _ = fs::write(marker, format!("{content}\n"));
    }
    Ok(())
}
