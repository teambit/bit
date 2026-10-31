use super::{Chalk, resolve_capsules_dir};
use crate::{commands::lane::scope_root::ScopeRoot, workspace};
use bit_workspace_config::{
    environment_value, global_config_dir, merge_layers, parse_jsonc, read_global_config,
    workspace_values,
};
use serde::Serialize;
use serde_json::{Map, Value};
use sha1::{Digest, Sha1};
use std::{
    fmt::Write as _,
    fs, io,
    path::Path,
    time::{SystemTime, UNIX_EPOCH},
};

const ORIGIN_FILE: &str = ".bit-capsule-origin.json";
const VALID_KINDS: &[&str] = &["workspace", "scope-aspects-root", "scope-aspect", "scope"];

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct RootEntry {
    pub(super) path: String,
    pub(super) kind: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(super) origin_path: Option<String>,
    pub(super) last_used_ms: u64,
    pub(super) size_bytes: u64,
}

pub(super) fn collect(cwd: &Path, with_sizes: bool) -> io::Result<Vec<RootEntry>> {
    let root = resolve_capsules_dir(cwd)?;
    let entries = match fs::read_dir(root) {
        Ok(entries) => entries,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(error) => return Err(error),
    };
    let mut paths = entries
        .collect::<io::Result<Vec<_>>>()?
        .into_iter()
        .filter(|entry| entry.file_type().is_ok_and(|kind| kind.is_dir()))
        .filter(|entry| {
            entry.file_name() != "node_modules"
                && !entry
                    .file_name()
                    .to_string_lossy()
                    .starts_with('.')
        })
        .map(|entry| entry.path())
        .collect::<Vec<_>>();
    paths.sort();
    Ok(paths
        .iter()
        .map(|path| inspect(path, with_sizes))
        .collect())
}

pub(super) fn inspect(path: &Path, with_sizes: bool) -> RootEntry {
    let marker = path.join(ORIGIN_FILE);
    let origin = fs::read(&marker)
        .ok()
        .and_then(|bytes| parse_jsonc(&bytes).ok());
    let valid = origin
        .as_ref()
        .filter(|value| {
            value
                .get("originPath")
                .and_then(Value::as_str)
                .is_some_and(|origin_path| !origin_path.trim().is_empty())
                && value
                    .get("kind")
                    .and_then(Value::as_str)
                    .is_some_and(|kind| VALID_KINDS.contains(&kind.trim()))
        });
    let stamp = valid
        .and_then(|_| fs::metadata(&marker).ok())
        .or_else(|| fs::metadata(path).ok())
        .and_then(|meta| meta.modified().ok());
    RootEntry {
        path: path.to_string_lossy().into_owned(),
        kind: valid
            .and_then(|value| value["kind"].as_str().map(str::trim))
            .unwrap_or("unmarked")
            .into(),
        origin_path: valid
            .and_then(|value| value["originPath"].as_str())
            .map(|origin_path| origin_path.trim().to_owned()),
        last_used_ms: stamp.map_or(0, millis),
        size_bytes: if with_sizes { dir_size(path) } else { 0 },
    }
}

pub(super) fn millis(time: SystemTime) -> u64 {
    time.duration_since(UNIX_EPOCH)
        .map_or(0, |duration| ((duration.as_nanos() + 500_000) / 1_000_000) as u64)
}

pub(super) fn now_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |duration| duration.as_millis() as u64)
}

pub(super) fn dir_size(path: &Path) -> u64 {
    let Ok(entries) = fs::read_dir(path) else { return 0 };
    entries
        .filter_map(Result::ok)
        .map(|entry| {
            let Ok(kind) = entry.file_type() else { return 0 };
            if kind.is_dir() {
                dir_size(&entry.path())
            } else if kind.is_file() {
                fs::symlink_metadata(entry.path()).map_or(0, |meta| meta.len())
            } else {
                0
            }
        })
        .sum()
}

pub(super) fn total_size(roots: &[RootEntry]) -> u64 {
    roots
        .iter()
        .map(|root| root.size_bytes)
        .sum()
}

pub(super) fn max_age_days(config: &Map<String, Value>) -> f64 {
    let env = environment_value("capsules_max_age_days").map(Value::String);
    let Some(value) = env
        .as_ref()
        .or_else(|| config.get("capsules_max_age_days"))
    else {
        return 30.0;
    };
    let number = match value {
        Value::Number(n) => n.as_f64(),
        Value::String(s) if !s.is_empty() => {
            let trimmed = s.trim();
            if trimmed.is_empty() { Some(0.0) } else { trimmed.parse().ok() }
        }
        Value::Bool(b) => Some(f64::from(u8::from(*b))),
        _ => None,
    };
    number
        .filter(|n: &f64| n.is_finite())
        .map_or(30.0, |n| n.max(0.0))
}

pub(super) fn summary(roots: &[RootEntry], age_days: f64, chalk: Chalk) -> String {
    let orphan = roots
        .iter()
        .filter(|root| {
            root.origin_path
                .as_ref()
                .is_some_and(|path| !Path::new(path).exists())
        })
        .count();
    let cutoff = age_days.mul_add(-86_400_000.0, now_millis() as f64);
    let stale = roots
        .iter()
        .filter(|root| root.kind == "scope-aspects-root")
        .map(|root| stale_children(Path::new(&root.path), cutoff))
        .sum::<usize>();
    format!(
        "cache total: {} across {} subdir(s) — {orphan} orphan(s), {stale} stale aspect-version(s) (>{age_days}d)",
        chalk.bold(&format_bytes(total_size(roots))),
        roots.len(),
    )
}

fn stale_children(path: &Path, cutoff: f64) -> usize {
    let Ok(entries) = fs::read_dir(path) else { return 0 };
    entries
        .filter_map(Result::ok)
        .filter(|entry| entry.file_type().is_ok_and(|kind| kind.is_dir()))
        .filter(|entry| {
            entry.file_name() != "node_modules"
                && !entry
                    .file_name()
                    .to_string_lossy()
                    .starts_with('.')
        })
        .filter(|entry| {
            let marker = entry.path().join(ORIGIN_FILE);
            let stamp = fs::metadata(marker)
                .or_else(|_| fs::metadata(entry.path()))
                .and_then(|meta| meta.modified());
            stamp.is_ok_and(|time| (millis(time) as f64) < cutoff)
        })
        .count()
}

pub(super) fn format_bytes(bytes: u64) -> String {
    if bytes == 0 {
        return "0 B".into();
    }
    let units = ["B", "KB", "MB", "GB", "TB"];
    let index = ((bytes as f64).log(1024.0).floor() as usize).min(units.len() - 1);
    if index == 0 {
        format!("{bytes} B")
    } else {
        let tenths = ((bytes as f64 / 1024_f64.powi(index as i32)) * 10.0).round();
        format!("{:.1} {}", tenths / 10.0, units[index])
    }
}

pub(in crate::commands::capsule) fn lookup_config_str(
    combined: &Map<String, Value>,
    key: &str,
) -> Option<String> {
    environment_value(key)
        .or_else(|| {
            combined
                .get(key)
                .and_then(Value::as_str)
                .filter(|val| !val.is_empty())
                .map(str::to_owned)
        })
}

pub(in crate::commands::capsule) fn read_combined_config(
    root: &ScopeRoot,
) -> io::Result<Map<String, Value>> {
    let global = read_global_config(&global_config_dir())?;
    let scope_dir = if root.bare { root.path.clone() } else { workspace::scope_path(&root.path) };
    let scope_layer = if scope_dir.join("scope.json").is_file() {
        parse_jsonc(&fs::read(scope_dir.join("scope.json"))?)?
            .get("config")
            .cloned()
            .unwrap_or(Value::Null)
    } else {
        Value::Null
    };
    let ws_layer = if root.bare {
        Value::Null
    } else {
        Value::Object(workspace_values(&parse_jsonc(&fs::read(root.path.join(
            "workspace.jsonc",
        ))?)?))
    };
    Ok(merge_layers(&global, &scope_layer, &ws_layer))
}

pub(in crate::commands::capsule) fn object_hash_short(text: &str) -> String {
    let payload = format!("string:{}:{text}", text.encode_utf16().count());
    let digest = Sha1::digest(payload.as_bytes());
    let mut out = String::with_capacity(10);
    for byte in &digest[..5] {
        let _ = write!(out, "{byte:02x}");
    }
    out.truncate(9);
    out
}
