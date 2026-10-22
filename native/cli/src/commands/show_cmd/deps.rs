//! Dependency detection and policy resolution for native `bit show`.

use super::deps_policy::{
    apply_component_json_policy, apply_model_dependencies, apply_policy_object,
    apply_variant_policies,
};
use bit_install::{
    config::{DEPENDENCY_RESOLVER_ASPECT, WorkspaceConfig},
    model::WorkspaceComponent,
    workspace::{BitmapEntry, ModelData, Workspace},
};
use serde_json::{Value, json};
use std::{
    fs,
    path::{Component, Path, PathBuf},
};

#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) struct DepEntry {
    pub id: String,
    pub package_name: Option<String>,
    pub version: String,
    pub lifecycle: &'static str,
    pub dep_type: &'static str,
    pub optional: bool,
    pub relative_paths: Vec<Value>,
}

pub(super) struct Identity<'a> {
    pub scope: &'a str,
    pub name: &'a str,
    pub package_name: &'a str,
}

impl Identity<'_> {
    pub(super) fn is_self(&self, candidate: &str) -> bool {
        let base_id = if self.scope.is_empty() {
            self.name.to_owned()
        } else {
            format!("{}/{}", self.scope, self.name)
        };
        let scoped_pkg = format!("@{}/{}", self.scope, self.name);
        let scoped_dot_pkg = format!("@{}/{}", self.scope, self.name.replace('/', "."));
        let stripped = strip_pkg_version(candidate);
        stripped == self.package_name
            || stripped == scoped_pkg
            || stripped == scoped_dot_pkg
            || stripped == base_id
            || stripped == self.name
            || stripped.starts_with(&format!("{}/", self.package_name))
            || stripped.starts_with(&format!("{scoped_pkg}/"))
            || stripped.starts_with(&format!("{scoped_dot_pkg}/"))
    }
}

fn strip_pkg_version(raw: &str) -> &str {
    if let Some(rest) = raw.strip_prefix('@') {
        match rest.find('@') {
            Some(idx) => &raw[..=idx],
            None => raw,
        }
    } else {
        raw.split('@').next().unwrap_or(raw)
    }
}

pub(super) fn collect_dependencies(
    root: &Path,
    ws_config: &WorkspaceConfig,
    ws: &Workspace,
    entry: &BitmapEntry,
    component: &WorkspaceComponent,
    model: Option<&ModelData>,
    scope: &str,
) -> Vec<DepEntry> {
    let identity = Identity { scope, name: &entry.id.name, package_name: &component.package_name };
    let mut deps = Vec::new();
    scan_component_files(root, ws_config, ws, entry, component, &identity, &mut deps);
    if let Some(model_data) = model {
        apply_model_dependencies(model_data, &identity, &mut deps);
    }
    apply_variant_policies(ws_config, entry, &identity, &mut deps);
    apply_component_json_policy(&component.dir, &identity, &mut deps);
    if let Some(cfg) = entry.config
        .as_ref()
        .and_then(|map| map.get(DEPENDENCY_RESOLVER_ASPECT))
    {
        apply_policy_object(&cfg["policy"], &identity, &mut deps);
    }
    deps
}

fn scan_component_files(
    root: &Path,
    ws_config: &WorkspaceConfig,
    ws: &Workspace,
    entry: &BitmapEntry,
    component: &WorkspaceComponent,
    identity: &Identity<'_>,
    deps: &mut Vec<DepEntry>,
) {
    for rel_file in &component.files {
        for raw_spec in scanned_specifiers(&component.dir, rel_file) {
            if identity.is_self(&raw_spec) {
                continue;
            }
            if raw_spec.starts_with('.') {
                resolve_relative_import(ws, entry, rel_file, &raw_spec, deps);
            } else {
                resolve_package_import(root, ws_config, ws, identity, &raw_spec, deps);
            }
        }
    }
}

fn scanned_specifiers(comp_dir: &Path, rel_file: &str) -> Vec<String> {
    let Ok(source) = fs::read_to_string(comp_dir.join(rel_file)) else {
        return Vec::new();
    };
    let Ok(scanned) = bit_dependency_scanner::scan_source(rel_file.to_owned(), source) else {
        return Vec::new();
    };
    scanned["dependencies"]
        .as_object()
        .map(|specifiers| specifiers.keys().cloned().collect())
        .unwrap_or_default()
}

fn resolve_relative_import(
    ws: &Workspace,
    entry: &BitmapEntry,
    rel_file: &str,
    raw_spec: &str,
    deps: &mut Vec<DepEntry>,
) {
    let base_dir = Path::new(&entry.root_dir)
        .join(rel_file)
        .parent()
        .map_or_else(PathBuf::new, Path::to_path_buf);
    let resolved = normalize_rel_path(&base_dir.join(raw_spec));
    if !entry.root_dir.is_empty() && resolved.starts_with(entry.root_dir.trim_end_matches('/')) {
        return;
    }
    let Some(other) = ws.components
        .iter()
        .find(|comp| {
            comp.id != entry.id
                && !comp.root_dir.is_empty()
                && resolved.starts_with(comp.root_dir.trim_end_matches('/'))
        })
    else {
        return;
    };
    add_workspace_component_dep(other, Some((rel_file, &other.main_file)), deps);
}

fn normalize_rel_path(path: &Path) -> String {
    let mut parts: Vec<&str> = Vec::new();
    for part in path.components() {
        match part {
            Component::Normal(seg) => parts.extend(seg.to_str()),
            Component::ParentDir => {
                parts.pop();
            }
            _ => {}
        }
    }
    parts.join("/")
}

fn resolve_package_import(
    root: &Path,
    ws_config: &WorkspaceConfig,
    ws: &Workspace,
    identity: &Identity<'_>,
    raw_spec: &str,
    deps: &mut Vec<DepEntry>,
) {
    let pkg_name = extract_package_name(raw_spec);
    if identity.is_self(pkg_name) || pkg_name.starts_with("@teambit/") {
        return;
    }
    if let Some(other) = ws.components
        .iter()
        .find(|comp| {
            let other_scope = comp.id.effective_scope().unwrap_or_default();
            comp.package_name == pkg_name || format!("@{other_scope}/{}", comp.id.name) == pkg_name
        })
    {
        add_workspace_component_dep(other, None, deps);
        return;
    }
    if let Some(ver) = lookup_package_version(root, ws_config, pkg_name) {
        upsert_dep(
            deps,
            DepEntry {
                id: pkg_name.to_owned(),
                package_name: Some(pkg_name.to_owned()),
                version: ver,
                lifecycle: "runtime",
                dep_type: "package",
                optional: false,
                relative_paths: Vec::new(),
            },
        );
    }
}

fn extract_package_name(specifier: &str) -> &str {
    if specifier.starts_with('@') {
        let mut indices = specifier.match_indices('/');
        let _ = indices.next();
        match indices.next() {
            Some((idx, _)) => &specifier[..idx],
            None => specifier,
        }
    } else {
        specifier
            .split('/')
            .next()
            .unwrap_or(specifier)
    }
}

fn add_workspace_component_dep(
    other: &WorkspaceComponent,
    rel_pair: Option<(&str, &str)>,
    deps: &mut Vec<DepEntry>,
) {
    let ver = other.id.version.clone().unwrap_or_else(|| "0.0.1-new".to_owned());
    let id = match other.id.version.as_deref() {
        Some(version) if !version.is_empty() => {
            format!("{}@{version}", other.id.to_string_without_version())
        }
        _ => other.id.to_string_without_version(),
    };
    let relative_paths = match rel_pair {
        Some((src, dst)) => vec![json!({
            "sourceRelativePath": src,
            "destinationRelativePath": dst,
        })],
        None => Vec::new(),
    };
    upsert_dep(
        deps,
        DepEntry {
            id,
            package_name: Some(other.package_name.clone()),
            version: ver,
            lifecycle: "runtime",
            dep_type: "component",
            optional: false,
            relative_paths,
        },
    );
}

fn lookup_package_version(
    root: &Path,
    ws_config: &WorkspaceConfig,
    pkg_name: &str,
) -> Option<String> {
    let ws_policy = &ws_config.dependency_resolver.policy["dependencies"][pkg_name];
    if let Some(ver) = ws_policy
        .as_str()
        .or_else(|| ws_policy["version"].as_str())
    {
        return Some(ver.to_owned());
    }
    let pkg_json_path = root
        .join("node_modules")
        .join(pkg_name)
        .join("package.json");
    let text = fs::read_to_string(pkg_json_path).ok()?;
    let parsed: Value = serde_json::from_str(&text).ok()?;
    parsed["version"].as_str().map(str::to_owned)
}

pub(super) fn remove_dep(deps: &mut Vec<DepEntry>, target: &str) {
    deps.retain(|dep| dep.id != target && dep.package_name.as_deref() != Some(target));
}

pub(super) fn upsert_dep(deps: &mut Vec<DepEntry>, entry: DepEntry) {
    if let Some(existing) = deps
        .iter_mut()
        .find(|dep| dep.id == entry.id || dep.package_name == entry.package_name)
    {
        existing.version = entry.version;
        existing.lifecycle = entry.lifecycle;
        existing.optional = entry.optional;
        if !entry.relative_paths.is_empty() {
            existing.relative_paths = entry.relative_paths;
        }
    } else {
        deps.push(entry);
    }
}
