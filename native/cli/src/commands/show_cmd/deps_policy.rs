//! Dependency policy resolution (model, variants, `component.json`, `.bitmap`) for native `bit show`.

use super::deps::{DepEntry, Identity, remove_dep, upsert_dep};
use bit_install::{
    config::{DEPENDENCY_RESOLVER_ASPECT, WorkspaceConfig, aspect_id_without_version},
    jsonc,
    workspace::{BitmapEntry, ModelData, by_root_dir_and_name},
};
use serde_json::Value;
use std::{fs, path::Path};

pub(super) fn apply_model_dependencies(
    model: &ModelData,
    identity: &Identity<'_>,
    deps: &mut Vec<DepEntry>,
) {
    let Some(ext) = model.extensions
        .iter()
        .find(|item| {
            item["name"]
                .as_str()
                .is_some_and(|name| aspect_id_without_version(name) == DEPENDENCY_RESOLVER_ASPECT)
        })
    else {
        return;
    };
    apply_policy_object(&ext["config"]["policy"], identity, deps);
    if let Some(policy_arr) = ext["data"]["policy"].as_array() {
        for item in policy_arr {
            apply_model_policy_item(item, identity, deps);
        }
    }
    if let Some(dep_arr) = ext["data"]["dependencies"].as_array() {
        for item in dep_arr {
            apply_model_dep_item(item, identity, deps);
        }
    }
}

fn apply_model_policy_item(item: &Value, identity: &Identity<'_>, deps: &mut Vec<DepEntry>) {
    let Some(dep_id) = item["dependencyId"].as_str() else {
        return;
    };
    if identity.is_self(dep_id) {
        return;
    }
    let Some(ver) = item["value"]["version"].as_str() else {
        return;
    };
    if ver == "-" {
        remove_dep(deps, dep_id);
        return;
    }
    let lifecycle = match item["lifecycleType"].as_str() {
        Some("dev") => "dev",
        Some("peer") => "peer",
        _ => "runtime",
    };
    let optional = item["optional"].as_bool().unwrap_or(false);
    upsert_dep(
        deps,
        DepEntry {
            id: dep_id.to_owned(),
            package_name: Some(dep_id.to_owned()),
            version: ver.to_owned(),
            lifecycle,
            dep_type: "package",
            optional,
            relative_paths: Vec::new(),
        },
    );
}

fn apply_model_dep_item(item: &Value, identity: &Identity<'_>, deps: &mut Vec<DepEntry>) {
    let Some(dep_id) = item["packageName"]
        .as_str()
        .or_else(|| item["id"].as_str())
    else {
        return;
    };
    if identity.is_self(dep_id) {
        return;
    }
    let Some(ver) = item["version"].as_str() else {
        return;
    };
    let lifecycle = match item["lifecycle"].as_str() {
        Some("dev") => "dev",
        Some("peer") => "peer",
        _ => "runtime",
    };
    let dep_type =
        if item["__type"].as_str() == Some("component") { "component" } else { "package" };
    let optional = item["optional"].as_bool().unwrap_or(false);
    upsert_dep(
        deps,
        DepEntry {
            id: dep_id.to_owned(),
            package_name: Some(dep_id.to_owned()),
            version: ver.to_owned(),
            lifecycle,
            dep_type,
            optional,
            relative_paths: Vec::new(),
        },
    );
}

pub(super) fn apply_variant_policies(
    ws_config: &WorkspaceConfig,
    entry: &BitmapEntry,
    identity: &Identity<'_>,
    deps: &mut Vec<DepEntry>,
) {
    let Ok(variant) = by_root_dir_and_name(
        &ws_config.variants,
        entry.root_dir.trim_end_matches('/'),
        &entry.id.name,
    ) else {
        return;
    };
    for ext_map in variant.extensions.iter().rev() {
        if let Some(cfg) = ext_map.get(DEPENDENCY_RESOLVER_ASPECT) {
            apply_policy_object(&cfg["policy"], identity, deps);
        }
    }
}

pub(super) fn apply_component_json_policy(
    dir: &Path,
    identity: &Identity<'_>,
    deps: &mut Vec<DepEntry>,
) {
    let Ok(text) = fs::read_to_string(dir.join("component.json")) else {
        return;
    };
    let Ok(parsed) = jsonc::parse(&text) else {
        return;
    };
    let cfg = &parsed["extensions"][DEPENDENCY_RESOLVER_ASPECT];
    apply_policy_object(&cfg["policy"], identity, deps);
}

pub(super) fn apply_policy_object(
    policy: &Value,
    identity: &Identity<'_>,
    deps: &mut Vec<DepEntry>,
) {
    let fields = [
        ("dependencies", "runtime", false),
        ("devDependencies", "dev", false),
        ("peerDependencies", "peer", false),
        ("optionalDependencies", "runtime", true),
    ];
    for (field, lifecycle, default_opt) in fields {
        let Some(pkg_map) = policy[field].as_object() else {
            continue;
        };
        for (pkg_name, val) in pkg_map {
            apply_single_policy_entry(pkg_name, val, lifecycle, default_opt, identity, deps);
        }
    }
}

fn apply_single_policy_entry(
    pkg_name: &str,
    val: &Value,
    lifecycle: &'static str,
    default_opt: bool,
    identity: &Identity<'_>,
    deps: &mut Vec<DepEntry>,
) {
    if identity.is_self(pkg_name) {
        return;
    }
    let ver_opt = val
        .as_str()
        .map(|ver| (ver, default_opt))
        .or_else(|| {
            let ver = val["version"].as_str()?;
            let opt = default_opt || val["optional"].as_bool().unwrap_or(false);
            Some((ver, opt))
        });
    let Some((ver, optional)) = ver_opt else {
        return;
    };
    if ver == "-" {
        remove_dep(deps, pkg_name);
        return;
    }
    upsert_dep(
        deps,
        DepEntry {
            id: pkg_name.to_owned(),
            package_name: Some(pkg_name.to_owned()),
            version: ver.to_owned(),
            lifecycle,
            dep_type: "package",
            optional,
            relative_paths: Vec::new(),
        },
    );
}
