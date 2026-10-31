//! Scope object, remote-ref, stash, and stray-file inventory for `bit gc`.

use super::graph::{
    comp_value_key,
    models::{load_staged_snaps, load_stashed_hashes, load_unmerged_roots},
};
use serde_json::Value;
use std::{
    collections::{HashMap, HashSet},
    fs,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

const STRAY_MIN_AGE_MS: u64 = 60 * 60 * 1000;
const FS_METADATA_FILES: &[&str] = &[".DS_Store", "Thumbs.db", "desktop.ini"];

type RemoteRefsPair = (HashMap<String, Vec<String>>, HashSet<String>);

#[derive(Debug, Clone)]
pub(super) struct ObjectEntry {
    pub hash: String,
    pub kind: String,
    pub size: u64,
    pub mtime_ms: u64,
    pub value: Value,
}

#[derive(Debug, Default, Clone)]
pub(super) struct StrayTempFiles {
    pub count: usize,
    pub size: u64,
    pub paths: Vec<PathBuf>,
}

#[derive(Debug, Default, Clone)]
pub(super) struct ScopeRootRefs {
    pub remote_refs_per_comp: HashMap<String, Vec<String>>,
    pub remote_refs: HashSet<String>,
    pub bare_roots: Vec<String>,
    pub unmerged_roots: Vec<String>,
}

#[derive(Debug, Default, Clone)]
pub(super) struct ScopeInventory {
    pub objects: Vec<ObjectEntry>,
    pub trashed_lanes: Vec<Value>,
    pub roots: ScopeRootRefs,
    pub stray_files: StrayTempFiles,
    pub backup_dir_size: u64,
    pub retained_dirs_size: u64,
    pub started_at_ms: u64,
}

pub(super) fn load_scope_inventory(scope_dir: &Path) -> Result<ScopeInventory, String> {
    let started_at_ms = now_ms();
    let backup_dir_size = dir_size(&scope_dir.join("deleted-objects"));
    let retained_dirs_size =
        dir_size(&scope_dir.join("trash")) + dir_size(&scope_dir.join("stash"));
    let (objects, stray_files) = scan_objects_dir(scope_dir, started_at_ms)?;
    let trashed_lanes = load_trashed_lanes(scope_dir)?;
    let (remote_refs_per_comp, remote_refs) = load_remote_lanes(scope_dir)?;
    let mut bare_roots = load_staged_snaps(scope_dir);
    bare_roots.extend(load_stashed_hashes(scope_dir)?);
    let unmerged_roots = load_unmerged_roots(scope_dir)?;
    Ok(ScopeInventory {
        objects,
        trashed_lanes,
        roots: ScopeRootRefs { remote_refs_per_comp, remote_refs, bare_roots, unmerged_roots },
        stray_files,
        backup_dir_size,
        retained_dirs_size,
        started_at_ms,
    })
}

fn scan_objects_dir(
    scope_dir: &Path,
    started_at_ms: u64,
) -> Result<(Vec<ObjectEntry>, StrayTempFiles), String> {
    let mut objects = Vec::new();
    let mut unreadable = Vec::new();
    let mut stray_files = StrayTempFiles::default();
    let stale_before = started_at_ms.saturating_sub(STRAY_MIN_AGE_MS);
    for bucket_path in sorted_dir_entries(&scope_dir.join("objects")) {
        let Some(bucket_name) = hex_bucket_dir_name(&bucket_path) else { continue };
        for entry_path in sorted_dir_entries(&bucket_path) {
            classify_bucket_entry(
                scope_dir,
                bucket_name,
                &entry_path,
                stale_before,
                (&mut objects, &mut unreadable, &mut stray_files),
            );
        }
    }
    if !unreadable.is_empty() {
        let list = unreadable
            .iter()
            .map(|path| format!("  {}", path.display()))
            .collect::<Vec<_>>()
            .join("\n");
        return Err(format!(
            "unable to read {} object(s) in the scope, so it is not safe to run gc.\nthese objects are most likely corrupted. bit can fetch them again from the remote, so it is safe to\ndelete them and run gc again:\n{list}",
            unreadable.len(),
        ));
    }
    Ok((objects, stray_files))
}

fn classify_bucket_entry(
    scope_dir: &Path,
    bucket_name: &str,
    entry_path: &Path,
    stale_before: u64,
    accum: (&mut Vec<ObjectEntry>, &mut Vec<PathBuf>, &mut StrayTempFiles),
) {
    let (objects, unreadable, stray_files) = accum;
    let Some(leaf_name) = file_name_str(entry_path) else { return };
    if is_hex_len(leaf_name, 38) {
        let Ok(meta) = fs::metadata(entry_path) else { return };
        if !meta.is_file() {
            return;
        }
        let hash = format!("{bucket_name}{leaf_name}");
        match bit_object_import::read_scope_object(scope_dir, &hash) {
            Ok(Some((kind, value))) if is_known_kind(&kind) => {
                objects.push(ObjectEntry {
                    hash,
                    kind,
                    size: meta.len(),
                    mtime_ms: meta_mtime_ms(&meta),
                    value,
                });
            }
            _ => unreadable.push(entry_path.to_path_buf()),
        }
    } else if is_stray_temp_name(leaf_name)
        && let Ok(meta) = fs::metadata(entry_path)
        && meta.is_file()
        && meta_mtime_ms(&meta) <= stale_before
    {
        stray_files.count += 1;
        stray_files.size += meta.len();
        stray_files.paths.push(entry_path.to_path_buf());
    }
}

fn load_trashed_lanes(scope_dir: &Path) -> Result<Vec<Value>, String> {
    let trash_dir = scope_dir.join("trash");
    if !trash_dir.is_dir() {
        return Ok(Vec::new());
    }
    let temp = tempfile::tempdir().map_err(|err| err.to_string())?;
    let mut lanes = Vec::new();
    for bucket_path in sorted_dir_entries(&trash_dir) {
        let Some(bucket_name) = hex_bucket_dir_name(&bucket_path) else { continue };
        for entry_path in sorted_dir_entries(&bucket_path) {
            if let Some(lane) =
                read_one_trashed_lane(&trash_dir, temp.path(), bucket_name, &entry_path)?
            {
                lanes.push(lane);
            }
        }
    }
    Ok(lanes)
}

fn read_one_trashed_lane(
    trash_dir: &Path,
    temp_root: &Path,
    bucket_name: &str,
    entry_path: &Path,
) -> Result<Option<Value>, String> {
    let Some(leaf_name) = file_name_str(entry_path) else { return Ok(None) };
    if !is_hex_len(leaf_name, 38) || !entry_path.is_file() {
        return Ok(None);
    }
    let dst_dir = temp_root.join("objects").join(bucket_name);
    let copy_res =
        fs::create_dir_all(&dst_dir).and_then(|()| fs::copy(entry_path, dst_dir.join(leaf_name)));
    let hash = format!("{bucket_name}{leaf_name}");
    match copy_res.and_then(|_| bit_object_import::read_scope_object(temp_root, &hash)) {
        Ok(Some((kind, val))) if kind == "Lane" => Ok(Some(val)),
        Ok(Some((kind, _))) if is_known_kind(&kind) => Ok(None),
        Ok(_) => Err(trash_read_error(trash_dir, "corrupted object in trash")),
        Err(err) => Err(trash_read_error(trash_dir, &err.to_string())),
    }
}

fn trash_read_error(trash_dir: &Path, reason: &str) -> String {
    let reason = reason.trim();
    format!(
        "unable to read the trash of the scope, so it is not safe to run gc.\nthe trash holds lanes that \"bit lane remove\" can bring back, and gc needs to know which snaps they\npoint at. empty the trash directory (\"{}\") if you don't need it, and run again.\nError: {reason}",
        trash_dir.display(),
    )
}

fn load_remote_lanes(scope_dir: &Path) -> Result<RemoteRefsPair, String> {
    let mut per_comp: HashMap<String, Vec<String>> = HashMap::new();
    let mut all_refs = HashSet::new();
    for dir_name in ["remote", "remotes"] {
        for remote_path in sorted_dir_entries(&scope_dir.join("refs").join(dir_name)) {
            if remote_path.is_dir() {
                collect_remote_lane_files(&remote_path, &mut per_comp, &mut all_refs)?;
            }
        }
    }
    Ok((per_comp, all_refs))
}

fn collect_remote_lane_files(
    dir: &Path,
    per_comp: &mut HashMap<String, Vec<String>>,
    all_refs: &mut HashSet<String>,
) -> Result<(), String> {
    for entry_path in sorted_dir_entries(dir) {
        if entry_path.is_dir() {
            collect_remote_lane_files(&entry_path, per_comp, all_refs)?;
        } else if entry_path.is_file() {
            parse_one_remote_lane_file(&entry_path, per_comp, all_refs)?;
        }
    }
    Ok(())
}

fn parse_one_remote_lane_file(
    entry_path: &Path,
    per_comp: &mut HashMap<String, Vec<String>>,
    all_refs: &mut HashSet<String>,
) -> Result<(), String> {
    let leaf_name = file_name_str(entry_path).unwrap_or("");
    let parsed = fs::read(entry_path)
        .ok()
        .and_then(|bytes| bit_object_import::parse_jsonc(&bytes).ok());
    let Some(Value::Array(items)) = parsed else {
        if FS_METADATA_FILES.contains(&leaf_name) {
            return Ok(());
        }
        return Err(format!("failed to read remote lane file {}", entry_path.display()));
    };
    for item in items {
        let Some(head) = item["head"]
            .as_str()
            .map(str::trim)
            .filter(|val| !val.is_empty())
        else {
            continue;
        };
        let comp_key = comp_value_key(&item["id"]);
        per_comp
            .entry(comp_key)
            .or_default()
            .push(head.to_owned());
        all_refs.insert(head.to_owned());
    }
    Ok(())
}

fn dir_size(dir: &Path) -> u64 {
    let Ok(entries) = fs::read_dir(dir) else { return 0 };
    let mut total = 0u64;
    for entry in entries.filter_map(Result::ok) {
        let path = entry.path();
        if let Ok(meta) = fs::symlink_metadata(&path) {
            total += if meta.is_dir() {
                dir_size(&path)
            } else if meta.is_file() {
                meta.len()
            } else {
                0
            };
        }
    }
    total
}

pub(super) fn sorted_dir_entries(dir: &Path) -> Vec<PathBuf> {
    let Ok(entries) = fs::read_dir(dir) else { return Vec::new() };
    let mut paths: Vec<PathBuf> = entries
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .collect();
    paths.sort();
    paths
}

fn hex_bucket_dir_name(path: &Path) -> Option<&str> {
    let name = file_name_str(path)?;
    (is_hex_len(name, 2) && path.is_dir()).then_some(name)
}

fn file_name_str(path: &Path) -> Option<&str> {
    path.file_name().and_then(|name| name.to_str())
}

fn is_hex_len(text: &str, expected_len: usize) -> bool {
    text.len() == expected_len
        && text
            .bytes()
            .all(|byte| byte.is_ascii_hexdigit() && !byte.is_ascii_uppercase())
}

fn is_stray_temp_name(name: &str) -> bool {
    name.split_once('.')
        .is_some_and(|(prefix, suffix)| {
            is_hex_len(prefix, 38)
                && !suffix.is_empty()
                && suffix.bytes().all(|byte| byte.is_ascii_digit())
        })
}

fn is_known_kind(kind: &str) -> bool {
    matches!(
        kind,
        "Component"
            | "Symlink"
            | "Version"
            | "Lane"
            | "ScopeMeta"
            | "VersionHistory"
            | "LaneHistory"
            | "Source",
    )
}

fn now_ms() -> u64 {
    let millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    u64::try_from(millis).unwrap_or(u64::MAX)
}

fn meta_mtime_ms(meta: &fs::Metadata) -> u64 {
    let millis = meta
        .modified()
        .ok()
        .and_then(|mtime| mtime.duration_since(UNIX_EPOCH).ok())
        .unwrap_or_default()
        .as_millis();
    u64::try_from(millis).unwrap_or(0)
}
