//! Dependency policy resolution (model, variants, `component.json`, `.bitmap`) for native `bit show`.

use super::deps::{DepEntry, Identity, remove_dep, upsert_dep};
use bit_install::{
    config::{DEPENDENCY_RESOLVER_ASPECT, WorkspaceConfig, aspect_id_without_version},
    jsonc,
    workspace::{BitmapEntry, ModelData, by_root_dir_and_name},
};
use serde_json::Value;
use std::{fs, path::Path};

pub(super) fn apply_version_dependencies(
    ver_val: &Value,
    model: &ModelData,
    identity: &Identity<'_>,
    deps: &mut Vec<DepEntry>,
) {
    apply_legacy_pkg_fields(ver_val, identity, deps);
    apply_legacy_comp_fields(ver_val, identity, deps);
    apply_model_dependencies(model, identity, deps);
}

fn apply_legacy_pkg_fields(ver_val: &Value, identity: &Identity<'_>, deps: &mut Vec<DepEntry>) {
    let pkg_fields = [
        ("packageDependencies", "runtime"),
        ("devPackageDependencies", "dev"),
        ("peerPackageDependencies", "peer"),
    ];
    for (field, lifecycle) in pkg_fields {
        if let Some(pkg_map) = ver_val[field].as_object() {
            for (pkg_name, ver_item) in pkg_map {
                apply_legacy_pkg_dep(pkg_name, ver_item, lifecycle, identity, deps);
            }
        }
    }
}

fn apply_legacy_comp_fields(ver_val: &Value, identity: &Identity<'_>, deps: &mut Vec<DepEntry>) {
    let comp_fields =
        [("dependencies", "runtime"), ("devDependencies", "dev"), ("peerDependencies", "peer")];
    for (field, lifecycle) in comp_fields {
        if let Some(comp_arr) = ver_val[field].as_array() {
            for item in comp_arr {
                apply_legacy_comp_dep(item, lifecycle, identity, deps);
            }
        }
    }
}

fn apply_legacy_pkg_dep(
    pkg_name: &str,
    ver_item: &Value,
    lifecycle: &'static str,
    identity: &Identity<'_>,
    deps: &mut Vec<DepEntry>,
) {
    if identity.is_self(pkg_name) {
        return;
    }
    let Some(ver) = ver_item
        .as_str()
        .map(str::trim)
        .filter(|ver| !ver.is_empty())
    else {
        return;
    };
    upsert_dep(
        deps,
        DepEntry {
            id: pkg_name.to_owned(),
            package_name: Some(pkg_name.to_owned()),
            version: ver.to_owned(),
            lifecycle,
            dep_type: "package",
            optional: false,
            relative_paths: Vec::new(),
        },
    );
}

fn apply_legacy_comp_dep(
    item: &Value,
    lifecycle: &'static str,
    identity: &Identity<'_>,
    deps: &mut Vec<DepEntry>,
) {
    let id_obj = &item["id"];
    let Some(name) = id_obj["name"].as_str() else {
        return;
    };
    let scope = id_obj["scope"].as_str().unwrap_or_default();
    let ver = id_obj["version"].as_str().unwrap_or_default();
    let bare_id = if scope.is_empty() { name.to_owned() } else { format!("{scope}/{name}") };
    if identity.is_self(&bare_id) {
        return;
    }
    let full_id = if ver.is_empty() { bare_id } else { format!("{bare_id}@{ver}") };
    let pkg_name = item["packageName"]
        .as_str()
        .map_or_else(|| format!("@{scope}/{}", name.replace('/', ".")), str::to_owned);
    let relative_paths = item["relativePaths"]
        .as_array()
        .cloned()
        .unwrap_or_default();
    upsert_dep(
        deps,
        DepEntry {
            id: full_id,
            package_name: Some(pkg_name),
            version: ver.to_owned(),
            lifecycle,
            dep_type: "component",
            optional: false,
            relative_paths,
        },
    );
}

pub(super) fn apply_model_dependencies(
    model: &ModelData,
    identity: &Identity<'_>,
    deps: &mut Vec<DepEntry>,
) {
    let Some(ext) = model.extensions
        .iter()
        .find(|item| crate::commands::update_cmd::matches_aspect(item, DEPENDENCY_RESOLVER_ASPECT))
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
    if let Some(dep) = model_dep_entry(item, identity) {
        upsert_dep(deps, dep);
    }
}

fn model_dep_entry(item: &Value, identity: &Identity<'_>) -> Option<DepEntry> {
    let is_comp = item["__type"].as_str() == Some("component");
    let obj_id = crate::commands::graph_cmd::builder::format_dep_id(&item["componentId"])
        .or_else(|| crate::commands::graph_cmd::builder::format_dep_id(&item["id"]));
    let dep_id = if is_comp {
        obj_id
            .as_deref()
            .or_else(|| item["packageName"].as_str())?
    } else {
        item["packageName"].as_str().or(obj_id.as_deref())?
    };
    if identity.is_self(dep_id) {
        return None;
    }
    let ver = item["version"]
        .as_str()
        .or_else(|| item["componentId"]["version"].as_str())
        .or_else(|| item["id"]["version"].as_str())?;
    let pkg_name = item["packageName"]
        .as_str()
        .unwrap_or(dep_id)
        .to_owned();
    let full_id = if is_comp && !dep_id.contains('@') && !ver.is_empty() {
        format!("{dep_id}@{ver}")
    } else {
        dep_id.to_owned()
    };
    let lifecycle = match item["lifecycle"].as_str() {
        Some("dev") => "dev",
        Some("peer") => "peer",
        _ => "runtime",
    };
    Some(DepEntry {
        id: full_id,
        package_name: Some(pkg_name),
        version: ver.to_owned(),
        lifecycle,
        dep_type: if is_comp { "component" } else { "package" },
        optional: item["optional"].as_bool().unwrap_or(false),
        relative_paths: Vec::new(),
    })
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
        for (key, cfg) in ext_map {
            if aspect_id_without_version(key) == DEPENDENCY_RESOLVER_ASPECT {
                apply_policy_object(&cfg["policy"], identity, deps);
            }
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
    if let Some((_, cfg)) =
        crate::commands::update_cmd::aspect_entry(&parsed["extensions"], DEPENDENCY_RESOLVER_ASPECT)
    {
        apply_policy_object(&cfg["policy"], identity, deps);
    }
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
    let Some((ver, optional)) = ver_opt.map(|(ver, opt)| (ver.trim(), opt)) else {
        return;
    };
    if ver.is_empty() {
        return;
    }
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
