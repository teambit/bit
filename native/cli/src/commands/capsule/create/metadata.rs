//! Root metadata ([`object_hash_short`]) written by `IsolatorMain` for workspace capsules.
//!
//! Writes root `package.json` ([`RootPackage`]) and `.bit-capsule-origin.json` ([`OriginMarker`]) markers via [`write_root_metadata`].

use super::super::object_hash_short;
use chrono::{SecondsFormat, Utc};
use serde::Serialize;
use std::{fs, io, path::Path, time::SystemTime};

/// Minimal root `package.json` payload identifying a Bit capsule root directory.
#[derive(Serialize)]
struct RootPackage<'a> {
    name: &'a str,
    #[serde(rename = "bit-capsule")]
    bit_capsule: bool,
}

/// Serialized `.bit-capsule-origin.json` marker recording capsule origin path, timestamp, and kind.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct OriginMarker<'a> {
    origin_path: &'a str,
    created_at: &'a str,
    kind: &'static str,
}

/// Writes root `package.json` ([`RootPackage`]) and `.bit-capsule-origin.json` ([`OriginMarker`]) metadata under `capsules_root`.
pub(super) fn write_root_metadata(capsules_root: &Path, base_dir: &str) -> io::Result<()> {
    let base_dir = base_dir.trim();
    if capsules_root
        .as_os_str()
        .as_encoded_bytes()
        .iter()
        .all(u8::is_ascii_whitespace)
        || base_dir.is_empty()
        || base_dir.chars().any(char::is_control)
    {
        return Err(io::Error::other("capsule root metadata path is empty"));
    }
    fs::create_dir_all(capsules_root)?;
    let package = capsules_root.join("package.json");
    if !package.exists() {
        let name = format!("capsules-{}", object_hash_short(base_dir));
        let content = serde_json::to_string(&RootPackage { name: &name, bit_capsule: true })?;
        fs::write(package, format!("{content}\n"))?;
    }
    let marker = capsules_root.join(".bit-capsule-origin.json");
    if has_valid_origin_marker(&marker) {
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

/// Returns `true` when `marker` exists and parses as JSON with non-empty `originPath`, `createdAt`, and `kind` fields.
#[inline]
fn has_valid_origin_marker(marker: &Path) -> bool {
    fs::read(marker)
        .ok()
        .and_then(|bytes| bit_object_import::parse_jsonc(&bytes).ok())
        .is_some_and(|val| {
            ["originPath", "createdAt", "kind"]
                .into_iter()
                .all(|key| {
                    val[key]
                        .as_str()
                        .is_some_and(|text| !text.trim().is_empty())
                })
        })
}
