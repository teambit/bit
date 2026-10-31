use super::{
    Options,
    collect::{Candidate, Target},
};
use crate::workspace;
use bit_install::{
    dependencies::default_package_name, model::ComponentId, policy::scope::hex_sha1,
};
use serde_json::Value;
use std::{
    collections::{HashMap, HashSet},
    fs,
    path::{Path, PathBuf},
    process::Command,
};

#[derive(Debug, Clone)]
pub(super) struct ResolvedUpdate {
    pub name: String,
    pub field: String,
    pub latest_range: String,
    pub target: Target,
}

pub(super) fn resolve_updates(
    root: &Path,
    candidates: &[Candidate],
    options: &Options,
    save_prefix: Option<&str>,
) -> Vec<ResolvedUpdate> {
    let mut cache: HashMap<String, Vec<String>> = HashMap::new();
    let remotes = read_local_remotes(root);
    let mut updates = Vec::new();
    for cand in candidates {
        let versions = available_versions(root, cand, &remotes, &mut cache);
        if let Some(upd) = evaluate_candidate(cand, &versions, options, save_prefix) {
            updates.push(upd);
        }
    }
    updates
}

fn read_local_remotes(root: &Path) -> HashMap<String, PathBuf> {
    let scope_dir = workspace::scope_path(root);
    let Ok(bytes) = fs::read(scope_dir.join("scope.json")) else {
        return HashMap::new();
    };
    let Ok(parsed) = bit_object_import::parse_jsonc(&bytes) else {
        return HashMap::new();
    };
    let Some(remotes) = parsed["remotes"].as_object() else {
        return HashMap::new();
    };
    remotes
        .iter()
        .filter_map(|(name, val)| {
            let path_str = val
                .as_str()?
                .trim()
                .strip_prefix("file://")?
                .trim();
            (!path_str.is_empty()).then(|| (name.clone(), PathBuf::from(path_str)))
        })
        .collect()
}

fn available_versions(
    root: &Path,
    cand: &Candidate,
    remotes: &HashMap<String, PathBuf>,
    cache: &mut HashMap<String, Vec<String>>,
) -> Vec<String> {
    if let Some(vers) = cache.get(&cand.name) {
        return vers.clone();
    }
    let resolved = resolve_scope_versions(root, cand, remotes)
        .filter(|vers| !vers.is_empty())
        .unwrap_or_else(|| query_npm_versions(&cand.name));
    cache.insert(cand.name.clone(), resolved.clone());
    resolved
}

fn resolve_scope_versions(
    root: &Path,
    cand: &Candidate,
    remotes: &HashMap<String, PathBuf>,
) -> Option<Vec<String>> {
    let bare_id =
        cand.comp_bare_id.clone().or_else(|| derive_bare_id_from_pkg(&cand.name, remotes))?;
    let comp_scope = bare_id.split('/').next()?;
    let remote_dir = remotes.get(comp_scope)?;
    let hash = crate::commands::debug_cat::lookup::resolve_component_entry(remote_dir, &bare_id)
        .map_or_else(|| hex_sha1(bare_id.as_bytes()), |(_, _, h)| h);
    let (kind, model) = bit_object_import::read_scope_object(remote_dir, &hash).ok()??;
    if kind != "Component" {
        return None;
    }
    let mut merged = serde_json::Map::new();
    for field in ["orphanedVersions", "versions"] {
        if let Some(map) = model[field].as_object() {
            merged.extend(map.clone());
        }
    }
    if merged.is_empty() {
        return None;
    }
    sync_remote_component_objects(root, remote_dir, &hash, &merged);
    Some(merged.keys().cloned().collect())
}

fn derive_bare_id_from_pkg(pkg_name: &str, remotes: &HashMap<String, PathBuf>) -> Option<String> {
    let scoped = pkg_name.strip_prefix('@')?;
    let (pkg_scope, pkg_rest) = scoped.split_once('/')?;
    if remotes.contains_key(pkg_scope) {
        return Some(format!("{pkg_scope}/{}", pkg_rest.replace('.', "/")));
    }
    for remote_name in remotes.keys() {
        let prefix = format!("{pkg_scope}.");
        if let Some(scope_tail) = remote_name.strip_prefix(&prefix)
            && let Some(comp_tail) = pkg_rest.strip_prefix(&format!("{scope_tail}."))
        {
            return Some(format!("{remote_name}/{}", comp_tail.replace('.', "/")));
        }
    }
    None
}

fn sync_remote_component_objects(
    root: &Path,
    remote_dir: &Path,
    comp_hash: &str,
    versions_obj: &serde_json::Map<String, Value>,
) {
    let local_scope = workspace::scope_path(root);
    copy_loose_object(remote_dir, &local_scope, comp_hash);
    for ver_val in versions_obj.values() {
        if let Some(ver_hash) = ver_val.as_str() {
            copy_loose_object(remote_dir, &local_scope, ver_hash);
        }
    }
}

fn copy_loose_object(src_scope: &Path, dst_scope: &Path, hash: &str) {
    if hash.len() < 3 {
        return;
    }
    let rel = Path::new("objects")
        .join(&hash[..2])
        .join(&hash[2..]);
    let src = src_scope.join(&rel);
    let dst = dst_scope.join(&rel);
    if src.is_file()
        && let Some(parent) = dst.parent()
    {
        let _ = fs::create_dir_all(parent);
        let _ = fs::copy(src, dst);
    }
}

fn query_npm_versions(pkg_name: &str) -> Vec<String> {
    let Ok(output) = Command::new("npm")
        .args(["view", pkg_name, "versions", "--json"])
        .output()
    else {
        return Vec::new();
    };
    if !output.status.success() {
        return Vec::new();
    }
    let Ok(parsed) = serde_json::from_slice::<Value>(&output.stdout) else {
        return Vec::new();
    };
    match parsed {
        Value::Array(arr) => arr
            .into_iter()
            .filter_map(|item| item.as_str().map(str::to_owned))
            .collect(),
        Value::String(single) => vec![single],
        _ => Vec::new(),
    }
}

fn evaluate_candidate(
    cand: &Candidate,
    versions: &[String],
    options: &Options,
    save_prefix: Option<&str>,
) -> Option<ResolvedUpdate> {
    let wanted = wanted_range(&cand.current_range, &cand.target, options)?;
    let latest_sv = pick_best_version(versions, &wanted)?;
    let curr_stripped = cand.current_range.trim_start_matches(['^', '~']);
    if let Ok(curr_sv) = node_semver::Version::parse(curr_stripped)
        && curr_sv >= latest_sv
    {
        return None;
    }
    let latest_str = latest_sv.to_string();
    let latest_range = compute_latest_range(cand, &latest_str, save_prefix);
    Some(ResolvedUpdate {
        name: cand.name.clone(),
        field: cand.field.clone(),
        latest_range,
        target: cand.target.clone(),
    })
}

fn wanted_range(current_range: &str, target: &Target, options: &Options) -> Option<String> {
    if !options.patch && !options.minor && !options.semver {
        return Some("latest".to_owned());
    }
    let stripped = current_range.trim_start_matches(['^', '~']);
    let parsed_ver = node_semver::Version::parse(stripped).ok();
    if options.semver {
        let is_comp_target = matches!(
            target,
            Target::ComponentJson(_)
                | Target::Bitmap(_)
                | Target::ModelRoot
                | Target::ModelBitmap(_),
        );
        if is_comp_target && node_semver::Version::parse(current_range).is_ok() {
            return Some(format!("^{current_range}"));
        }
        return Some(current_range.to_owned());
    }
    let ver = parsed_ver?;
    if options.patch {
        return Some(format!(">={ver} <{}.{}.0", ver.major, ver.minor + 1));
    }
    if options.minor {
        return Some(format!(">={ver} <{}.0.0", ver.major + 1));
    }
    Some("latest".to_owned())
}

fn pick_best_version(versions: &[String], wanted: &str) -> Option<node_semver::Version> {
    let parsed_vers: Vec<node_semver::Version> = versions
        .iter()
        .filter_map(|raw| node_semver::Version::parse(raw).ok())
        .collect();
    if wanted == "latest" {
        return parsed_vers
            .iter()
            .filter(|ver| ver.pre_release.is_empty())
            .max()
            .cloned()
            .or_else(|| parsed_vers.into_iter().max());
    }
    let range = node_semver::Range::parse(wanted).ok()?;
    parsed_vers
        .into_iter()
        .filter(|ver| range.satisfies(ver))
        .max()
}

fn compute_latest_range(cand: &Candidate, latest_ver: &str, save_prefix: Option<&str>) -> String {
    let uses_save_prefix =
        matches!(cand.target, Target::Bitmap(_) | Target::ModelRoot | Target::ModelBitmap(_));
    if uses_save_prefix && let Some(prefix) = save_prefix {
        return format!("{prefix}{latest_ver}");
    }
    repeat_prefix(&cand.current_range, latest_ver)
}

fn repeat_prefix(original_spec: &str, new_version: &str) -> String {
    match original_spec.chars().next() {
        Some('~') => format!("~{new_version}"),
        Some('^') => format!("^{new_version}"),
        _ => new_version.to_owned(),
    }
}

pub(super) fn collect_legacy_model_deps(
    ver_val: &Value,
    default_scope: Option<&str>,
    local_pkgs: &HashSet<String>,
    root_names: &HashSet<String>,
    out: &mut Vec<Candidate>,
) {
    for (dep_key, target_field) in
        [("dependencies", "dependencies"), ("devDependencies", "devDependencies")]
    {
        let Some(arr) = ver_val[dep_key].as_array() else { continue };
        for dep in arr {
            if let Some(cand) =
                candidate_from_legacy_dep(dep, target_field, default_scope, local_pkgs, root_names)
                && !out
                    .iter()
                    .any(|existing| existing.name == cand.name)
            {
                out.push(cand);
            }
        }
    }
}

fn candidate_from_legacy_dep(
    dep: &Value,
    target_field: &str,
    default_scope: Option<&str>,
    local_pkgs: &HashSet<String>,
    root_names: &HashSet<String>,
) -> Option<Candidate> {
    let inner = dep
        .get("id")
        .filter(|val| val.is_object())
        .unwrap_or(dep);
    let raw_name = inner["name"]
        .as_str()
        .filter(|name| !name.is_empty())?;
    let (comp_name, inline_ver) = raw_name
        .rsplit_once('@')
        .unwrap_or((raw_name, ""));
    let comp_scope = inner["scope"]
        .as_str()
        .filter(|sc| !sc.is_empty())
        .or(default_scope)?;
    let comp_ver = legacy_dep_version(dep, inner, inline_ver)?;
    let comp_id = ComponentId {
        scope: Some(comp_scope.to_owned()),
        default_scope: None,
        name: comp_name.to_owned(),
        version: None,
    };
    let pkg_name = default_package_name(&comp_id);
    if local_pkgs.contains(&pkg_name) || root_names.contains(&pkg_name) {
        return None;
    }
    Some(Candidate {
        name: pkg_name,
        current_range: comp_ver,
        field: target_field.to_owned(),
        target: Target::ModelRoot,
        comp_bare_id: Some(format!("{comp_scope}/{comp_name}")),
    })
}

fn legacy_dep_version(dep: &Value, inner: &Value, inline_ver: &str) -> Option<String> {
    [
        inner["version"].as_str(),
        dep["version"].as_str(),
        inner["head"].as_str(),
        dep["head"].as_str(),
    ]
    .into_iter()
    .flatten()
    .find(|ver| !ver.is_empty())
    .or_else(|| (!inline_ver.is_empty()).then_some(inline_ver))
    .map(str::to_owned)
}
