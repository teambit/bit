//! Stored schema lookup and workspace pattern matching for `bit schema`.

use crate::{
    commands::{
        aspect::workspace_default_scope,
        color::Chalk,
        debug_cat::lookup::resolve_component_entry,
        patterns,
        scope_set::{
            Failure,
            selection::{resolve_pattern_entries, valid_scope_str},
        },
    },
    workspace,
};
use bit_install::workspace::{Bitmap, BitmapEntry};
use serde_json::Value;
use std::{fs, path::Path};

pub(super) enum WorkspaceSchemaOutcome {
    Error(String),
    Schemas(Vec<Value>),
    Declined,
}

pub(super) fn resolve_workspace_schema(
    root: &Path,
    pattern: &str,
    json_flag: bool,
    chalk: Chalk,
) -> WorkspaceSchemaOutcome {
    let Some(bitmap) = load_bitmap(root) else {
        return WorkspaceSchemaOutcome::Declined;
    };
    let entries = match resolve_pattern_entries(root, &bitmap, pattern, chalk) {
        Ok(entries) => entries,
        Err(Failure::User(msg)) => return WorkspaceSchemaOutcome::Error(msg),
        Err(Failure::Declined(_)) => return WorkspaceSchemaOutcome::Declined,
    };
    if !json_flag {
        return WorkspaceSchemaOutcome::Declined;
    }
    let scope_dir = workspace::scope_path(root);
    let mut schemas = Vec::with_capacity(entries.len());
    for entry in entries {
        let Some(schema) = load_unmodified_entry_schema(root, &scope_dir, entry) else {
            return WorkspaceSchemaOutcome::Declined;
        };
        schemas.push(schema);
    }
    WorkspaceSchemaOutcome::Schemas(schemas)
}

pub(super) fn diagnose_workspace_diff_error(
    root: &Path,
    pattern: &str,
    chalk: Chalk,
) -> Option<String> {
    let bitmap = load_bitmap(root)?;
    match resolve_pattern_entries(root, &bitmap, pattern, chalk) {
        Err(Failure::User(msg)) => Some(msg),
        Ok(entries) if entries.len() > 1 => Some(format!(
            r#"pattern "{pattern}" matches {} components. please specify a single component."#,
            entries.len(),
        )),
        _ => None,
    }
}

pub(super) fn diagnose_scope_schema_error(scope_dir: &Path, pattern: &str) -> Option<String> {
    if pattern.contains(['$', ':']) || pattern.contains(" AND ") {
        return None;
    }
    if pattern.contains(['*', ',']) {
        let candidates = scope_pattern_candidates(scope_dir)?;
        let refs = candidates
            .iter()
            .map(|(id, _)| id.as_str())
            .collect::<Vec<_>>();
        let matched = patterns::matching(&refs, &patterns::split(pattern)).ok()?;
        return matched
            .is_empty()
            .then(|| format!(r#"unable to find any component matching the "{pattern}" pattern"#));
    }
    if pattern.contains('!') {
        return None;
    }
    let (bare_id, explicit_ver) = pattern
        .rsplit_once('@')
        .map_or((pattern, None), |(id, ver)| (id, Some(ver)));
    if bare_id.is_empty() || explicit_ver == Some("") || bare_id.starts_with('@') {
        return None;
    }
    let (scope, name) = bare_id.split_once('/')?;
    if !valid_scope_str(scope) || name.is_empty() || name.contains("//") {
        return None;
    }
    resolve_component_entry(scope_dir, bare_id)
        .is_none()
        .then(|| format!(r#"unable to find "{pattern}" in the scope"#))
}

pub(super) fn resolve_scope_schema_json(scope_dir: &Path, pattern: &str) -> Option<Vec<Value>> {
    if pattern.contains(['$', ':']) || pattern.contains(" AND ") {
        return None;
    }
    if pattern.contains('*') || pattern.contains(',') {
        return resolve_scope_pattern_schemas(scope_dir, pattern);
    }
    if pattern.contains('!') {
        return None;
    }
    let (bare_id, explicit_ver) = pattern
        .rsplit_once('@')
        .map_or((pattern, None), |(id, ver)| (id, Some(ver)));
    if bare_id.is_empty() || explicit_ver == Some("") {
        return None;
    }
    let (_, _, comp_hash) = resolve_component_entry(scope_dir, bare_id)?;
    Some(vec![read_component_schema(scope_dir, &comp_hash, explicit_ver.unwrap_or("latest"))?])
}

fn read_component_schema(scope_dir: &Path, comp_hash: &str, req_ver: &str) -> Option<Value> {
    let (kind, comp_val) = bit_object_import::read_scope_object(scope_dir, comp_hash).ok()??;
    if kind != "Component" {
        return None;
    }
    let ver_hash = resolve_version_hash(&comp_val, req_ver)?;
    let (ver_kind, ver_val) = bit_object_import::read_scope_object(scope_dir, &ver_hash).ok()??;
    if ver_kind != "Version" {
        return None;
    }
    extract_stored_schema(scope_dir, &ver_val)
}

fn resolve_scope_pattern_schemas(scope_dir: &Path, pattern: &str) -> Option<Vec<Value>> {
    let candidates = scope_pattern_candidates(scope_dir)?;
    let refs = candidates
        .iter()
        .map(|(id, _)| id.as_str())
        .collect::<Vec<_>>();
    let matched: std::collections::HashSet<String> =
        patterns::matching(&refs, &patterns::split(pattern))
            .ok()?
            .into_iter()
            .map(str::to_owned)
            .collect();
    if matched.is_empty() {
        return None;
    }
    let mut schemas = Vec::with_capacity(matched.len());
    for (identity, comp_hash) in candidates {
        if matched.contains(&identity) {
            schemas.push(read_component_schema(scope_dir, &comp_hash, "latest")?);
        }
    }
    Some(schemas)
}

fn scope_pattern_candidates(scope_dir: &Path) -> Option<Vec<(String, String)>> {
    let index: Value = serde_json::from_slice(&fs::read(scope_dir.join("index.json")).ok()?).ok()?;
    let rows = index["components"].as_array().or_else(|| index.as_array())?;
    if rows.len() > 128 {
        return None;
    }
    let mut candidates = Vec::new();
    for row in rows
        .iter()
        .filter(|row| row["isSymlink"] != true)
    {
        let comp_hash = row["hash"].as_str()?.to_owned();
        let (kind, comp_val) = bit_object_import::read_scope_object(scope_dir, &comp_hash).ok()??;
        if kind != "Component" {
            return None;
        }
        if comp_val["head"].as_str().is_none() {
            continue;
        }
        let identity = format!("{}/{}", row["id"]["scope"].as_str()?, row["id"]["name"].as_str()?);
        candidates.push((identity, comp_hash));
    }
    Some(candidates)
}

fn load_bitmap(root: &Path) -> Option<Bitmap> {
    let ws_bytes = fs::read(root.join("workspace.jsonc")).ok()?;
    let ws_val = bit_object_import::parse_jsonc(&ws_bytes).ok()?;
    let default_scope = workspace_default_scope(&ws_val).ok()?;
    Bitmap::load(root, Some(&default_scope)).ok()
}

fn load_unmodified_entry_schema(
    root: &Path,
    scope_dir: &Path,
    entry: &BitmapEntry,
) -> Option<Value> {
    let req_ver = entry.id.version
        .as_deref()
        .filter(|ver| !ver.is_empty())?;
    let full_id = entry.id.to_string_without_version();
    let (_, _, comp_hash) = resolve_component_entry(scope_dir, &full_id)
        .or_else(|| resolve_component_entry(scope_dir, &entry.id.name))?;
    let (kind, comp_val) = bit_object_import::read_scope_object(scope_dir, &comp_hash).ok()??;
    if kind != "Component" {
        return None;
    }
    let ver_hash = resolve_version_hash(&comp_val, req_ver)?;
    let (ver_kind, ver_val) = bit_object_import::read_scope_object(scope_dir, &ver_hash).ok()??;
    if ver_kind != "Version" || is_entry_modified_on_disk(root, scope_dir, entry, &ver_val) {
        return None;
    }
    extract_stored_schema(scope_dir, &ver_val)
}

fn resolve_version_hash(comp_val: &Value, req_ver: &str) -> Option<String> {
    if req_ver == "latest" {
        return comp_val["head"].as_str().map(str::to_owned);
    }
    if let Some(hash) = comp_val["versions"].get(req_ver).and_then(Value::as_str) {
        return Some(hash.to_owned());
    }
    if let Some(hash) = comp_val["orphanedVersions"].get(req_ver).and_then(Value::as_str) {
        return Some(hash.to_owned());
    }
    (req_ver.len() == 40 && req_ver.bytes().all(|byte| byte.is_ascii_hexdigit())).then(|| {
        req_ver.to_owned()
    })
}

pub(super) fn extract_stored_schema(scope_dir: &Path, ver_val: &Value) -> Option<Value> {
    let exts = ver_val["extensions"].as_array()?;
    if let Some(schema_ext) = exts
        .iter()
        .find(|ext| crate::commands::update_cmd::matches_aspect(ext, "teambit.semantics/schema"))
        && let Some(schema) = extract_direct_schema_data(&schema_ext["data"])
    {
        return Some(schema);
    }
    let builder_ext = exts
        .iter()
        .find(|ext| {
            crate::commands::update_cmd::matches_aspect(ext, "teambit.pipelines/builder")
        })?;
    let file_hash = find_schema_artifact_hash(builder_ext)?;
    let (_, body) = bit_object_import::read_raw_scope_object(scope_dir, &file_hash).ok()??;
    serde_json::from_slice(&body).ok()
}

fn extract_direct_schema_data(data: &Value) -> Option<Value> {
    if data["schema"].is_object() {
        return Some(data["schema"].clone());
    }
    if data.is_object()
        && (data.get("__schema").is_some()
            || data.get("module").is_some()
            || data.get("exports").is_some())
    {
        return Some(data.clone());
    }
    None
}

fn find_schema_artifact_hash(builder_ext: &Value) -> Option<String> {
    let items = builder_ext["data"]["artifacts"]
        .as_array()
        .or_else(|| builder_ext["artifacts"].as_array())?;
    let fallbacks = builder_ext["artifacts"].as_array();
    let art = items.iter().find(|item| is_schema_artifact(item))?;
    extract_first_file_hash(&art["files"])
        .or_else(|| {
            let name = art["name"].as_str()?;
            let matching = fallbacks?
                .iter()
                .find(|other| other["name"].as_str() == Some(name))?;
            extract_first_file_hash(&matching["files"])
        })
}

fn is_schema_artifact(art: &Value) -> bool {
    art["task"]["id"]
        .as_str()
        .is_some_and(|id| {
            bit_install::config::aspect_id_without_version(id) == "teambit.semantics/schema"
        })
        || art["generatedBy"]
            .as_str()
            .is_some_and(|id| {
                bit_install::config::aspect_id_without_version(id) == "teambit.semantics/schema"
            })
        || art["task"]["name"].as_str() == Some("ExtractSchema")
        || art["name"].as_str() == Some("schema")
}

fn extract_first_file_hash(files_val: &Value) -> Option<String> {
    let arr = files_val["refs"].as_array().or_else(|| files_val.as_array())?;
    let first = arr.first()?;
    first["ref"]
        .as_str()
        .or_else(|| first["ref"]["hash"].as_str())
        .or_else(|| first["file"].as_str())
        .filter(|hash| !hash.is_empty())
        .map(str::to_owned)
}

pub(super) fn is_entry_modified_on_disk(
    root: &Path,
    scope_dir: &Path,
    entry: &BitmapEntry,
    ver_val: &Value,
) -> bool {
    let comp_dir = root.join(&entry.root_dir);
    let Some(files) = ver_val["files"].as_array() else {
        return true;
    };
    if !comp_dir.is_dir() || count_comp_files(&comp_dir) != Some(files.len()) {
        return true;
    }
    for item in files {
        if !file_matches_version(&comp_dir, scope_dir, item) {
            return true;
        }
    }
    false
}

fn file_matches_version(comp_dir: &Path, scope_dir: &Path, item: &Value) -> bool {
    let Some(rel_path) = item["relativePath"].as_str() else {
        return false;
    };
    let Some(hash) = item["file"]
        .as_str()
        .or_else(|| item["file"]["hash"].as_str())
    else {
        return false;
    };
    let Ok(disk_bytes) = fs::read(comp_dir.join(rel_path)) else {
        return false;
    };
    let Ok(Some((_, source_bytes))) = bit_object_import::read_raw_scope_object(scope_dir, hash)
    else {
        return false;
    };
    disk_bytes == source_bytes
}

fn count_comp_files(dir: &Path) -> Option<usize> {
    let mut count = 0usize;
    for entry_res in fs::read_dir(dir).ok()? {
        let entry = entry_res.ok()?;
        let name = entry.file_name();
        let name_str = name.to_str()?;
        if matches!(name_str, "node_modules" | "dist" | "package.json" | "component.json") {
            continue;
        }
        let path = entry.path();
        if path.is_dir() {
            count += count_comp_files(&path)?;
        } else if path.is_file() {
            count += 1;
        }
    }
    Some(count)
}
