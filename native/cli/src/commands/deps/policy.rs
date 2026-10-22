//! Model, variant, `component.json`, and `.bitmap` policy application for `bit deps`.

use super::resolve::{
    Identity, ResolvedDep, WorkspaceDepsContext, package_dep, upsert_dep, workspace_comp_dep,
};
use bit_install::{
    config::{DEPENDENCY_RESOLVER_ASPECT, aspect_id_without_version},
    jsonc,
    workspace::{BitmapEntry, ModelData, by_root_dir_and_name},
};
use serde_json::Value;
use std::{fs, path::Path};

impl WorkspaceDepsContext {
    pub(super) fn apply_model(
        &self,
        model: &ModelData,
        identity: &Identity<'_>,
        deps: &mut Vec<ResolvedDep>,
    ) {
        let Some(ext) = model.extensions
            .iter()
            .find(|item| {
                item["name"]
                    .as_str()
                    .is_some_and(|name| {
                        aspect_id_without_version(name) == DEPENDENCY_RESOLVER_ASPECT
                    })
            })
        else {
            return;
        };
        self.apply_policy_object(&ext["config"]["policy"], identity, deps);
        if let Some(arr) = ext["data"]["policy"].as_array() {
            for item in arr {
                self.apply_model_policy_item(item, identity, deps);
            }
        }
        if let Some(arr) = ext["data"]["dependencies"].as_array() {
            for item in arr {
                apply_model_dep_item(item, identity, deps);
            }
        }
    }

    fn apply_model_policy_item(
        &self,
        item: &Value,
        identity: &Identity<'_>,
        deps: &mut Vec<ResolvedDep>,
    ) {
        let Some(dep_id) = item["dependencyId"].as_str() else { return };
        let Some(ver) = item["value"]["version"].as_str() else { return };
        let lifecycle = lifecycle_from_str(item["lifecycleType"].as_str());
        self.apply_resolved_policy_entry((dep_id, ver, lifecycle), identity, deps);
    }

    pub(super) fn apply_variants(
        &self,
        entry: &BitmapEntry,
        identity: &Identity<'_>,
        deps: &mut Vec<ResolvedDep>,
    ) {
        let Ok(variant) = by_root_dir_and_name(
            &self.ws_config.variants,
            entry.root_dir.trim_end_matches('/'),
            &entry.id.name,
        ) else {
            return;
        };
        for ext_map in variant.extensions.iter().rev() {
            if let Some(cfg) = ext_map.get(DEPENDENCY_RESOLVER_ASPECT) {
                self.apply_policy_object(&cfg["policy"], identity, deps);
            }
        }
    }

    pub(super) fn apply_component_json(
        &self,
        dir: &Path,
        identity: &Identity<'_>,
        deps: &mut Vec<ResolvedDep>,
    ) {
        let Ok(text) = fs::read_to_string(dir.join("component.json")) else { return };
        let Ok(parsed) = jsonc::parse(&text) else { return };
        let cfg = &parsed["extensions"][DEPENDENCY_RESOLVER_ASPECT];
        self.apply_policy_object(&cfg["policy"], identity, deps);
    }

    pub(super) fn apply_policy_object(
        &self,
        policy: &Value,
        identity: &Identity<'_>,
        deps: &mut Vec<ResolvedDep>,
    ) {
        let fields = [
            ("dependencies", "runtime"),
            ("devDependencies", "dev"),
            ("peerDependencies", "peer"),
            ("optionalDependencies", "runtime"),
        ];
        for (field, lifecycle) in fields {
            let Some(pkg_map) = policy[field].as_object() else { continue };
            for (pkg_name, val) in pkg_map {
                let Some(ver) = val
                    .as_str()
                    .or_else(|| val["version"].as_str())
                else {
                    continue;
                };
                self.apply_resolved_policy_entry((pkg_name, ver, lifecycle), identity, deps);
            }
        }
    }

    fn apply_resolved_policy_entry(
        &self,
        spec: (&str, &str, &'static str),
        identity: &Identity<'_>,
        deps: &mut Vec<ResolvedDep>,
    ) {
        let (pkg_name, ver, lifecycle) = spec;
        if identity.is_self(pkg_name) {
            return;
        }
        if ver == "-" {
            deps.retain(|dep| dep.package_name != pkg_name && dep.id != pkg_name);
            return;
        }
        if let Some(other) = self.find_comp_by_pkg(pkg_name) {
            upsert_dep(deps, workspace_comp_dep(other, lifecycle, Some(ver)));
        } else if let Some(comp_dep) = self.node_modules_comp_dep(pkg_name, lifecycle, Some(ver)) {
            upsert_dep(deps, comp_dep);
        } else {
            upsert_dep(deps, package_dep(pkg_name, ver, lifecycle));
        }
    }
}

fn lifecycle_from_str(raw: Option<&str>) -> &'static str {
    match raw {
        Some("dev") => "dev",
        Some("peer") => "peer",
        _ => "runtime",
    }
}

fn apply_model_dep_item(item: &Value, identity: &Identity<'_>, deps: &mut Vec<ResolvedDep>) {
    let Some(pkg_name) = item["packageName"]
        .as_str()
        .or_else(|| item["id"].as_str())
    else {
        return;
    };
    if identity.is_self(pkg_name) {
        return;
    }
    let Some(ver) = item["version"].as_str() else { return };
    let lifecycle = lifecycle_from_str(item["lifecycle"].as_str());
    let is_comp = item["__type"].as_str() == Some("component");
    let raw_id = item["id"].as_str().unwrap_or(pkg_name);
    let bare = raw_id
        .split('@')
        .next()
        .unwrap_or(raw_id);
    let comp_name = is_comp.then(|| {
        bare.split_once('/')
            .map_or(bare, |(_, name)| name)
            .to_owned()
    });
    upsert_dep(
        deps,
        ResolvedDep {
            id: if is_comp && !raw_id.contains('@') {
                format!("{raw_id}@{ver}")
            } else {
                raw_id.to_owned()
            },
            package_name: pkg_name.to_owned(),
            version: ver.to_owned(),
            lifecycle,
            dep_type: if is_comp { "component" } else { "package" },
            comp_name,
            comp_bare_id: is_comp.then(|| bare.to_owned()),
            is_extension: item["isExtension"].as_bool().unwrap_or(false),
        },
    );
}
