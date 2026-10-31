//! Artifact extraction and filtering for `bit artifacts`.

use super::{
    Options,
    render::{render_artifacts_report, save_artifacts_to_dir},
    scope::resolve_bare_scope_targets,
};
use crate::{
    commands::{
        aspect::workspace_default_scope,
        debug_cat::lookup::resolve_component_entry,
        patterns,
        remote_action::startup,
        scope_set::{Failure, selection},
        workspace_command::format::Formatter,
    },
    workspace,
};
use bit_install::workspace::{Bitmap, BitmapEntry};
use serde_json::Value;
use std::{fs, path::Path};

#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) struct ArtifactFile {
    pub relative_path: String,
    pub hash: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) struct ArtifactItem {
    pub artifact_name: String,
    pub aspect_id: String,
    pub task_name: String,
    pub files: Vec<ArtifactFile>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) struct ComponentArtifacts {
    pub identity_no_ver: String,
    pub display_id: String,
    pub artifacts: Vec<ArtifactItem>,
}

pub(super) struct TargetComponent {
    pub identity_no_ver: String,
    pub comp_name: String,
    pub version: Option<String>,
}

pub(super) fn extract_and_render(
    root: &Path,
    options: &Options,
    formatter: &Formatter,
) -> Result<String, Failure> {
    let bitmap = load_workspace_bitmap(root)?;
    let scope_dir = workspace::scope_path(root);
    let targets = resolve_targets(root, &scope_dir, &bitmap, &options.pattern, formatter)?;
    render_targets_artifacts(&scope_dir, &targets, options, formatter)
}

pub(super) fn extract_scope_and_render(
    scope_dir: &Path,
    options: &Options,
    formatter: &Formatter,
) -> Result<String, Failure> {
    if startup::supported(None, scope_dir, &Value::Null, true).ok() != Some(true) {
        return Err(Failure::Declined("bare scope requires unsupported startup".into()));
    }
    let targets = resolve_bare_scope_targets(scope_dir, &options.pattern)?;
    render_targets_artifacts(scope_dir, &targets, options, formatter)
}

fn render_targets_artifacts(
    scope_dir: &Path,
    targets: &[TargetComponent],
    options: &Options,
    formatter: &Formatter,
) -> Result<String, Failure> {
    let mut results = Vec::with_capacity(targets.len());
    for target in targets {
        let mut comp_artifacts = load_component_artifacts(scope_dir, target)?;
        filter_artifacts(&mut comp_artifacts.artifacts, options)?;
        results.push(comp_artifacts);
    }
    let saved_count = if let Some(out_dir) = &options.out_dir {
        save_artifacts_to_dir(scope_dir, &results, out_dir)?
    } else {
        0
    };
    Ok(render_artifacts_report(
        &results,
        &options.pattern,
        options.out_dir.as_deref(),
        saved_count,
        formatter,
    ))
}

fn load_workspace_bitmap(root: &Path) -> Result<Bitmap, Failure> {
    let ws_bytes =
        fs::read(root.join("workspace.jsonc")).map_err(|err| Failure::Declined(err.to_string()))?;
    let ws_val = bit_object_import::parse_jsonc(&ws_bytes)
        .map_err(|err| Failure::Declined(err.to_string()))?;
    let default_scope = workspace_default_scope(&ws_val)?;
    Bitmap::load(root, Some(&default_scope)).map_err(|err| Failure::Declined(err.to_string()))
}

fn resolve_targets(
    root: &Path,
    scope_dir: &Path,
    bitmap: &Bitmap,
    pattern: &str,
    formatter: &Formatter,
) -> Result<Vec<TargetComponent>, Failure> {
    if !pattern.contains(['*', ',', '!', '$', ':']) {
        return resolve_literal_target(scope_dir, bitmap, pattern);
    }
    let entries = selection::resolve_pattern_entries(root, bitmap, pattern, formatter.chalk)?;
    Ok(entries
        .into_iter()
        .map(target_from_bitmap_entry)
        .collect())
}

fn resolve_literal_target(
    scope_dir: &Path,
    bitmap: &Bitmap,
    pattern: &str,
) -> Result<Vec<TargetComponent>, Failure> {
    let (bare_id, explicit_ver) = pattern
        .rsplit_once('@')
        .map_or((pattern, None), |(id, ver)| (id, Some(ver)));
    if bare_id.is_empty() || explicit_ver == Some("") {
        return Err(Failure::Declined("invalid component id".into()));
    }
    if let Some(target) = find_bitmap_target(bitmap, bare_id, explicit_ver) {
        return Ok(vec![target]);
    }
    let Some((scope_opt, comp_name, _)) = resolve_component_entry(scope_dir, bare_id) else {
        return Err(Failure::Declined("literal component not found locally".into()));
    };
    let identity_no_ver = scope_opt
        .as_deref()
        .filter(|scope| !scope.is_empty())
        .map_or_else(|| comp_name.clone(), |scope| format!("{scope}/{comp_name}"));
    Ok(vec![TargetComponent {
        identity_no_ver,
        comp_name,
        version: Some(explicit_ver.unwrap_or("latest").to_owned()),
    }])
}

fn find_bitmap_target(
    bitmap: &Bitmap,
    bare_id: &str,
    explicit_ver: Option<&str>,
) -> Option<TargetComponent> {
    let normalized = bare_id.trim_start_matches("./").trim_end_matches('/');
    let entry = bitmap.entries
        .iter()
        .find(|entry| {
            entry.owns_its_dir()
                && (entry.id.to_string_without_version() == bare_id
                    || entry.id.name == bare_id
                    || (!entry.root_dir.is_empty() && entry.root_dir == normalized))
        })?;
    let mut target = target_from_bitmap_entry(entry);
    if let Some(ver) = explicit_ver {
        target.version = Some(ver.to_owned());
    }
    Some(target)
}

fn target_from_bitmap_entry(entry: &BitmapEntry) -> TargetComponent {
    TargetComponent {
        identity_no_ver: entry.id.to_string_without_version(),
        comp_name: entry.id.name.clone(),
        version: entry.id.version
            .clone()
            .filter(|ver| !ver.is_empty()),
    }
}

fn load_component_artifacts(
    scope_dir: &Path,
    target: &TargetComponent,
) -> Result<ComponentArtifacts, Failure> {
    let Some(req_ver) = target.version.as_deref() else {
        return Ok(ComponentArtifacts {
            identity_no_ver: target.identity_no_ver.clone(),
            display_id: target.identity_no_ver.clone(),
            artifacts: Vec::new(),
        });
    };
    let (_, _, comp_hash) = resolve_component_entry(scope_dir, &target.identity_no_ver)
        .or_else(|| resolve_component_entry(scope_dir, &target.comp_name))
        .ok_or_else(|| Failure::Declined("component entry missing in index.json".into()))?;
    let (kind, comp_val) = bit_object_import::read_scope_object(scope_dir, &comp_hash)
        .ok()
        .flatten()
        .ok_or_else(|| Failure::Declined("component object missing".into()))?;
    if kind != "Component" {
        return Err(Failure::Declined("expected Component object".into()));
    }
    let (resolved_ver, ver_hash) = resolve_target_version(&comp_val, req_ver)
        .ok_or_else(|| Failure::Declined("version hash not found".into()))?;
    let ver_val = read_version_with_remote_fallback(scope_dir, &comp_val, &ver_hash)?;
    let artifacts = parse_builder_artifacts(&ver_val);
    let display_id = format!("{}@{resolved_ver}", target.identity_no_ver);
    Ok(ComponentArtifacts {
        identity_no_ver: target.identity_no_ver.clone(),
        display_id,
        artifacts,
    })
}

fn resolve_target_version(comp_val: &Value, req_ver: &str) -> Option<(String, String)> {
    if req_ver == "latest" {
        let head = comp_val["head"].as_str()?;
        let tag = find_tag_for_hash(comp_val, head).unwrap_or_else(|| head.to_owned());
        return Some((tag, head.to_owned()));
    }
    if let Some(hash) = comp_val["versions"].get(req_ver).and_then(Value::as_str) {
        return Some((req_ver.to_owned(), hash.to_owned()));
    }
    if let Some(hash) = comp_val["orphanedVersions"].get(req_ver).and_then(Value::as_str) {
        return Some((req_ver.to_owned(), hash.to_owned()));
    }
    if req_ver.len() == 40 && req_ver.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return Some((req_ver.to_owned(), req_ver.to_owned()));
    }
    None
}

fn find_tag_for_hash(comp_val: &Value, target_hash: &str) -> Option<String> {
    comp_val["versions"]
        .as_object()?
        .iter()
        .find_map(|(tag, hash_val)| (hash_val.as_str() == Some(target_hash)).then(|| tag.clone()))
}

fn read_version_with_remote_fallback(
    scope_dir: &Path,
    comp_val: &Value,
    ver_hash: &str,
) -> Result<Value, Failure> {
    let local_ver = read_version_object(scope_dir, ver_hash);
    if let Some(ref val) = local_ver
        && !parse_builder_artifacts(val).is_empty()
    {
        return Ok(local_ver.unwrap_or_default());
    }
    if let Some(remote_ver) = try_read_remote_version(scope_dir, comp_val, ver_hash)? {
        return Ok(remote_ver);
    }
    local_ver.ok_or_else(|| Failure::Declined("Version object missing locally".into()))
}

fn try_read_remote_version(
    scope_dir: &Path,
    comp_val: &Value,
    ver_hash: &str,
) -> Result<Option<Value>, Failure> {
    let Some(comp_scope) = comp_val["scope"].as_str() else {
        return Ok(None);
    };
    let Some(remote_url) = lookup_remote_url(scope_dir, comp_scope) else {
        return Ok(None);
    };
    let Some(remote_path) = remote_url.strip_prefix("file://") else {
        return Err(Failure::Declined("remote scope refresh required".into()));
    };
    Ok(read_version_object(Path::new(remote_path), ver_hash)
        .filter(|val| !parse_builder_artifacts(val).is_empty()))
}

fn read_version_object(scope_dir: &Path, ver_hash: &str) -> Option<Value> {
    bit_object_import::read_scope_object(scope_dir, ver_hash)
        .ok()
        .flatten()
        .and_then(|(kind, val)| (kind == "Version").then_some(val))
}

fn lookup_remote_url(scope_dir: &Path, comp_scope: &str) -> Option<String> {
    let bytes = fs::read(scope_dir.join("scope.json")).ok()?;
    let val: Value = serde_json::from_slice(&bytes).ok()?;
    val["remotes"]
        .get(comp_scope)
        .and_then(Value::as_str)
        .map(str::to_owned)
}

pub(super) fn parse_builder_artifacts(ver_val: &Value) -> Vec<ArtifactItem> {
    let Some(exts) = ver_val["extensions"].as_array() else {
        return Vec::new();
    };
    let Some(builder_ext) = exts
        .iter()
        .find(|ext| crate::commands::update_cmd::matches_aspect(ext, "teambit.pipelines/builder"))
    else {
        return Vec::new();
    };
    let raw_artifacts = builder_ext["data"]["artifacts"]
        .as_array()
        .or_else(|| builder_ext["artifacts"].as_array());
    let Some(items) = raw_artifacts else {
        return Vec::new();
    };
    let fallback_artifacts = builder_ext["artifacts"].as_array();
    items
        .iter()
        .map(|art| parse_single_artifact(art, fallback_artifacts))
        .collect()
}

fn parse_single_artifact(art: &Value, fallback_artifacts: Option<&Vec<Value>>) -> ArtifactItem {
    let artifact_name = art["name"]
        .as_str()
        .unwrap_or_default()
        .to_owned();
    let generated_by = art["generatedBy"].as_str().unwrap_or_default();
    let aspect_id = art["task"]["id"]
        .as_str()
        .unwrap_or(generated_by)
        .to_owned();
    let task_name = art["task"]["name"]
        .as_str()
        .filter(|name| !name.is_empty())
        .unwrap_or(generated_by)
        .to_owned();
    let mut files = extract_artifact_files(&art["files"]);
    if files.is_empty()
        && let Some(fallbacks) = fallback_artifacts
        && let Some(matching) = fallbacks
            .iter()
            .find(|other| other["name"].as_str() == Some(artifact_name.as_str()))
    {
        files = extract_artifact_files(&matching["files"]);
    }
    ArtifactItem { artifact_name, aspect_id, task_name, files }
}

fn extract_artifact_files(files_val: &Value) -> Vec<ArtifactFile> {
    let arr_opt = files_val["refs"].as_array().or_else(|| files_val.as_array());
    let Some(arr) = arr_opt else {
        return Vec::new();
    };
    arr.iter()
        .filter_map(|item| {
            let relative_path = item["relativePath"]
                .as_str()
                .or_else(|| item["relative"].as_str())?
                .to_owned();
            let hash = item["ref"]
                .as_str()
                .or_else(|| item["ref"]["hash"].as_str())
                .or_else(|| item["file"].as_str())
                .unwrap_or_default()
                .to_owned();
            Some(ArtifactFile { relative_path, hash })
        })
        .collect()
}

pub(super) fn filter_artifacts(
    artifacts: &mut Vec<ArtifactItem>,
    options: &Options,
) -> Result<(), Failure> {
    if options.aspect.is_some() || options.task.is_some() {
        artifacts.retain(|art| matches_aspect_and_task(art, options));
    }
    if let Some(files_glob) = &options.files {
        filter_by_files_glob(artifacts, files_glob)?;
    }
    Ok(())
}

fn matches_aspect_and_task(art: &ArtifactItem, options: &Options) -> bool {
    options.aspect
        .as_deref()
        .is_none_or(|aspect| art.aspect_id == aspect)
        && options.task
            .as_deref()
            .is_none_or(|task| art.task_name == task)
}

fn filter_by_files_glob(
    artifacts: &mut Vec<ArtifactItem>,
    files_glob: &str,
) -> Result<(), Failure> {
    let split_globs = patterns::split(files_glob);
    for art in artifacts.iter_mut() {
        art.files = retain_matching_files(&art.files, &split_globs)?;
    }
    artifacts.retain(|art| !art.files.is_empty());
    Ok(())
}

fn retain_matching_files(
    files: &[ArtifactFile],
    split_globs: &[String],
) -> Result<Vec<ArtifactFile>, Failure> {
    let mut kept = Vec::new();
    for file in files {
        let matched = patterns::matching(&[file.relative_path.as_str()], split_globs)
            .map_err(|_| Failure::Declined("unsupported files glob".into()))?;
        if !matched.is_empty() {
            kept.push(file.clone());
        }
    }
    Ok(kept)
}
