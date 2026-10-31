use crate::commands::{
    aspect::{find_bitmap_row_ref, workspace_default_scope},
    set_peer::DEP_RESOLVER_ID,
};
use bit_install::{
    dependencies::default_package_name,
    model::ComponentId,
    policy::scope::Scope,
    workspace::{Bitmap, BitmapEntry},
};
use bit_object_import::parse_jsonc;
use serde_json::Value;
use std::{
    collections::HashSet,
    fs,
    path::{Path, PathBuf},
};

const POLICY_FIELDS: [&str; 3] = ["dependencies", "devDependencies", "peerDependencies"];

#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) enum Target {
    RootPolicy,
    Variant(String),
    ComponentJson(PathBuf),
    Bitmap(String),
    ModelRoot,
    ModelBitmap(String),
}

#[derive(Debug, Clone)]
pub(super) struct Candidate {
    pub name: String,
    pub current_range: String,
    pub field: String,
    pub target: Target,
    pub comp_bare_id: Option<String>,
}

pub(super) struct Collected {
    pub candidates: Vec<Candidate>,
    pub save_prefix: Option<String>,
}

pub(super) fn collect_candidates(root: &Path, patterns: &[String]) -> Result<Collected, String> {
    let ws_bytes = fs::read(root.join("workspace.jsonc")).map_err(|err| err.to_string())?;
    let bitmap_bytes = fs::read(root.join(".bitmap")).map_err(|err| err.to_string())?;
    let ws_val = parse_jsonc(&ws_bytes).map_err(|err| err.to_string())?;
    let bitmap_val = parse_jsonc(&bitmap_bytes).map_err(|err| err.to_string())?;
    let default_scope = workspace_default_scope(&ws_val).ok();
    let save_prefix = super::aspect_entry(&ws_val, DEP_RESOLVER_ID)
        .and_then(|(_, resolver)| resolver["savePrefix"].as_str())
        .map(str::to_owned);
    let bitmap = Bitmap::load(root, default_scope.as_deref()).map_err(|err| err.to_string())?;
    let local_pkgs = build_local_package_set(&bitmap, default_scope.as_deref());
    let mut candidates = Vec::new();
    let root_names = collect_root_policy(&ws_val, &local_pkgs, &mut candidates);
    collect_variants(&ws_val, &local_pkgs, &mut candidates);
    collect_components(
        root,
        &bitmap,
        &bitmap_val,
        default_scope.as_deref(),
        &local_pkgs,
        &root_names,
        &mut candidates,
    );
    filter_by_patterns(&mut candidates, patterns);
    Ok(Collected { candidates, save_prefix })
}

fn build_local_package_set(bitmap: &Bitmap, default_scope: Option<&str>) -> HashSet<String> {
    let mut set = HashSet::new();
    for entry in bitmap.entries.iter().filter(|ent| ent.owns_its_dir()) {
        set.insert(default_package_name(&entry.id));
        if let Some(scope) = entry.id.effective_scope().or(default_scope) {
            let scoped_id = ComponentId {
                scope: Some(scope.to_owned()),
                default_scope: None,
                name: entry.id.name.clone(),
                version: None,
            };
            set.insert(default_package_name(&scoped_id));
            set.insert(format!("@{scope}/{}", entry.id.name));
        }
    }
    set
}

fn collect_root_policy(
    ws_val: &Value,
    local_pkgs: &HashSet<String>,
    out: &mut Vec<Candidate>,
) -> HashSet<String> {
    let mut names = HashSet::new();
    let Some((_, resolver)) = super::aspect_entry(ws_val, DEP_RESOLVER_ID) else {
        return names;
    };
    let policy = &resolver["policy"];
    for field in POLICY_FIELDS {
        for (name, range) in policy_field_entries(&policy[field]) {
            if !local_pkgs.contains(&name) {
                names.insert(name.clone());
                out.push(Candidate {
                    name,
                    current_range: range,
                    field: field.to_owned(),
                    target: Target::RootPolicy,
                    comp_bare_id: None,
                });
            }
        }
    }
    names
}

fn collect_variants(ws_val: &Value, local_pkgs: &HashSet<String>, out: &mut Vec<Candidate>) {
    let Some(variants) = super::aspect_entry(ws_val, "teambit.workspace/variants")
        .and_then(|(_, val)| val.as_object())
    else {
        return;
    };
    for (pattern, variant_cfg) in variants {
        if let Some((_, resolver)) = super::aspect_entry(variant_cfg, DEP_RESOLVER_ID) {
            append_policy_candidates(
                &resolver["policy"],
                local_pkgs,
                &Target::Variant(pattern.clone()),
                out,
            );
        }
    }
}

fn collect_components(
    root: &Path,
    bitmap: &Bitmap,
    bitmap_val: &Value,
    default_scope: Option<&str>,
    local_pkgs: &HashSet<String>,
    root_names: &HashSet<String>,
    out: &mut Vec<Candidate>,
) {
    let scope = Scope::find(root);
    for entry in bitmap.entries.iter().filter(|ent| ent.owns_its_dir()) {
        collect_comp_json(root, entry, local_pkgs, out);
        collect_bitmap_row(bitmap_val, entry, local_pkgs, out);
        if let Some(scope_ref) = &scope {
            collect_model_deps(scope_ref, entry, default_scope, local_pkgs, root_names, out);
        }
    }
}

fn collect_comp_json(
    root: &Path,
    entry: &BitmapEntry,
    local_pkgs: &HashSet<String>,
    out: &mut Vec<Candidate>,
) {
    if entry.root_dir.is_empty() {
        return;
    }
    let path = root.join(&entry.root_dir).join("component.json");
    let Ok(bytes) = fs::read(&path) else {
        return;
    };
    let Ok(parsed) = serde_json::from_slice::<Value>(&bytes) else {
        return;
    };
    let Some((_, resolver)) = super::aspect_entry(&parsed["extensions"], DEP_RESOLVER_ID) else {
        return;
    };
    append_policy_candidates(&resolver["policy"], local_pkgs, &Target::ComponentJson(path), out);
}

fn collect_bitmap_row(
    bitmap_val: &Value,
    entry: &BitmapEntry,
    local_pkgs: &HashSet<String>,
    out: &mut Vec<Candidate>,
) {
    let Ok(row) = find_bitmap_row_ref(bitmap_val, entry) else {
        return;
    };
    let Some((_, resolver)) = super::aspect_entry(&row["config"], DEP_RESOLVER_ID) else {
        return;
    };
    let target = Target::Bitmap(entry.id.to_string_without_version());
    append_policy_candidates(&resolver["policy"], local_pkgs, &target, out);
}

fn append_policy_candidates(
    policy: &Value,
    local_pkgs: &HashSet<String>,
    target: &Target,
    out: &mut Vec<Candidate>,
) {
    for field in POLICY_FIELDS {
        for (name, range) in policy_field_entries(&policy[field]) {
            if !local_pkgs.contains(&name) {
                out.push(Candidate {
                    name,
                    current_range: range,
                    field: field.to_owned(),
                    target: target.clone(),
                    comp_bare_id: None,
                });
            }
        }
    }
}

fn policy_field_entries(field_val: &Value) -> Vec<(String, String)> {
    let Some(obj) = field_val.as_object() else {
        return Vec::new();
    };
    obj.iter()
        .filter_map(|(name, val)| {
            let range = val
                .as_str()
                .or_else(|| val.get("version").and_then(Value::as_str))?;
            (range != "-" && !range.is_empty()).then(|| (name.clone(), range.to_owned()))
        })
        .collect()
}

fn collect_model_deps(
    scope: &Scope,
    entry: &BitmapEntry,
    default_scope: Option<&str>,
    local_pkgs: &HashSet<String>,
    root_names: &HashSet<String>,
    out: &mut Vec<Candidate>,
) {
    let Some(ver) = entry.id.version
        .as_deref()
        .filter(|ver| !ver.is_empty())
    else {
        return;
    };
    let Some(ver_val) = scope
        .version(&entry.id.to_string_without_version(), Some(ver))
        .ok()
        .flatten()
        .or_else(|| {
            scope
                .version(&entry.id.name, Some(ver))
                .ok()
                .flatten()
        })
    else {
        return;
    };
    collect_serialized_model_deps(&ver_val, entry, local_pkgs, root_names, out);
    collect_legacy_model_deps(&ver_val, default_scope, local_pkgs, root_names, out);
}

fn collect_serialized_model_deps(
    ver_val: &Value,
    entry: &BitmapEntry,
    local_pkgs: &HashSet<String>,
    root_names: &HashSet<String>,
    out: &mut Vec<Candidate>,
) {
    let Some(deps) = ver_val["extensions"]
        .as_array()
        .and_then(|arr| {
            arr.iter()
                .find(|ext| ext["name"].as_str() == Some(DEP_RESOLVER_ID))
        })
        .and_then(|ext| ext["data"]["dependencies"].as_array())
    else {
        return;
    };
    for dep in deps {
        if let Some(cand) = candidate_from_serialized(dep, entry, local_pkgs, root_names) {
            out.push(cand);
        }
    }
}

fn candidate_from_serialized(
    dep: &Value,
    entry: &BitmapEntry,
    local_pkgs: &HashSet<String>,
    root_names: &HashSet<String>,
) -> Option<Candidate> {
    if dep["isExtension"].as_bool() == Some(true) || dep["lifecycle"].as_str() == Some("peer") {
        return None;
    }
    let is_comp = dep["__type"].as_str() == Some("component");
    let name = if is_comp { dep["packageName"].as_str()? } else { dep["id"].as_str()? };
    if local_pkgs.contains(name) {
        return None;
    }
    let current_range = dep["version"].as_str()?.to_owned();
    let (field, target) = serialized_field_and_target(dep, entry, name, root_names)?;
    let comp_bare_id = is_comp.then(|| extract_serialized_comp_id(dep)).flatten();
    Some(Candidate {
        name: name.to_owned(),
        current_range,
        field: field.to_owned(),
        target,
        comp_bare_id,
    })
}

fn serialized_field_and_target(
    dep: &Value,
    entry: &BitmapEntry,
    name: &str,
    root_names: &HashSet<String>,
) -> Option<(&'static str, Target)> {
    let field =
        if dep["lifecycle"].as_str() == Some("dev") { "devDependencies" } else { "dependencies" };
    let is_auto = dep["source"].as_str() != Some("config");
    if is_auto && root_names.contains(name) {
        return None;
    }
    let target = if is_auto {
        Target::ModelRoot
    } else {
        Target::ModelBitmap(entry.id.to_string_without_version())
    };
    Some((field, target))
}

fn extract_serialized_comp_id(dep: &Value) -> Option<String> {
    if let (Some(scope), Some(name)) =
        (dep["componentId"]["scope"].as_str(), dep["componentId"]["name"].as_str())
    {
        return Some(format!("{scope}/{name}"));
    }
    dep["id"]
        .as_str()
        .and_then(|raw| raw.split('@').next())
        .filter(|bare| bare.contains('/'))
        .map(str::to_owned)
}

fn collect_legacy_model_deps(
    ver_val: &Value,
    default_scope: Option<&str>,
    local_pkgs: &HashSet<String>,
    root_names: &HashSet<String>,
    out: &mut Vec<Candidate>,
) {
    for (dep_key, target_field) in
        [("dependencies", "dependencies"), ("devDependencies", "devDependencies")]
    {
        let Some(arr) = ver_val[dep_key].as_array() else {
            continue;
        };
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
    let comp_name = dep["id"]["name"].as_str()?;
    let comp_scope = dep["id"]["scope"].as_str().or(default_scope)?;
    let comp_ver = dep["id"]["version"].as_str()?;
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
        current_range: comp_ver.to_owned(),
        field: target_field.to_owned(),
        target: Target::ModelRoot,
        comp_bare_id: Some(format!("{comp_scope}/{comp_name}")),
    })
}

fn filter_by_patterns(candidates: &mut Vec<Candidate>, patterns: &[String]) {
    if patterns.is_empty() {
        return;
    }
    candidates.retain(|cand| {
        patterns
            .iter()
            .any(|pat| pat == &cand.name)
            || bit_workspace_config::glob::match_patterns(&cand.name, patterns)
    });
}
