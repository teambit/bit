//! Dependency detection and policy resolution for native `bit show`.

use super::deps_policy::{
    apply_component_json_policy, apply_model_dependencies, apply_policy_object,
    apply_variant_policies,
};
use bit_install::{
    config::{DEPENDENCY_RESOLVER_ASPECT, WorkspaceConfig, aspect_id_without_version},
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

pub(super) struct CompContext<'a> {
    pub root: &'a Path,
    pub ws_config: &'a WorkspaceConfig,
    pub ws: &'a Workspace,
    pub entry: &'a BitmapEntry,
    pub component: &'a WorkspaceComponent,
    pub model: Option<&'a ModelData>,
    pub scope: &'a str,
}

pub(super) fn collect_dependencies(ctx: &CompContext<'_>) -> Vec<DepEntry> {
    let identity = Identity {
        scope: ctx.scope,
        name: &ctx.entry.id.name,
        package_name: &ctx.component.package_name,
    };
    let mut deps = Vec::new();
    if let Some(model_data) = ctx.model {
        apply_model_dependencies(model_data, &identity, &mut deps);
    }
    scan_component_files(ctx, &identity, &mut deps);
    apply_variant_policies(ctx.ws_config, ctx.entry, &identity, &mut deps);
    apply_component_json_policy(&ctx.component.dir, &identity, &mut deps);
    if let Some(cfg) =
        crate::commands::update_cmd::bitmap_entry_aspect(ctx.entry, DEPENDENCY_RESOLVER_ASPECT)
    {
        apply_policy_object(&cfg["policy"], &identity, &mut deps);
    }
    deps
}

fn is_dev_file(rel_file: &str, env_id: &str) -> bool {
    let is_readme = aspect_id_without_version(env_id) == "teambit.mdx/readme";
    rel_file.contains(".spec.")
        || rel_file.contains(".test.")
        || (!is_readme && rel_file.contains(".docs."))
        || rel_file.contains(".composition.")
        || rel_file.contains(".compositions.")
}

fn scan_component_files(ctx: &CompContext<'_>, identity: &Identity<'_>, deps: &mut Vec<DepEntry>) {
    for rel_file in &ctx.component.files {
        let file_lifecycle =
            if is_dev_file(rel_file, &ctx.component.env_id) { "dev" } else { "runtime" };
        for raw_spec in scanned_specifiers(&ctx.component.dir, rel_file) {
            apply_scanned_specifier(ctx, identity, rel_file, &raw_spec, file_lifecycle, deps);
        }
    }
}

fn apply_scanned_specifier(
    ctx: &CompContext<'_>,
    identity: &Identity<'_>,
    rel_file: &str,
    raw_spec: &str,
    lifecycle: &'static str,
    deps: &mut Vec<DepEntry>,
) {
    if identity.is_self(raw_spec) {
        return;
    }
    if raw_spec.starts_with('.') {
        resolve_relative_import(ctx.ws, ctx.entry, rel_file, raw_spec, deps);
    } else {
        resolve_package_import(ctx, identity, raw_spec, lifecycle, deps);
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
    let Some((_, other)) = ws
        .active()
        .find(|(_, comp)| {
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
    ctx: &CompContext<'_>,
    identity: &Identity<'_>,
    raw_spec: &str,
    file_lifecycle: &'static str,
    deps: &mut Vec<DepEntry>,
) {
    let pkg_name = extract_package_name(raw_spec);
    if identity.is_self(pkg_name) || pkg_name.starts_with("@teambit/") {
        return;
    }
    if let Some((_, other)) = ctx.ws
        .active()
        .find(|(_, comp)| {
            let other_scope = comp.id.effective_scope().unwrap_or_default();
            comp.package_name == pkg_name || format!("@{other_scope}/{}", comp.id.name) == pkg_name
        })
    {
        add_workspace_component_dep(other, None, deps);
        return;
    }
    if let Some(ver) = lookup_package_version(ctx.root, &ctx.component.dir, ctx.ws_config, pkg_name)
    {
        let existing_lifecycle = deps
            .iter()
            .find(|dep| dep.id == pkg_name || dep.package_name.as_deref() == Some(pkg_name))
            .map(|dep| dep.lifecycle);
        let lifecycle = match existing_lifecycle {
            Some("runtime" | "peer") if file_lifecycle == "dev" => {
                existing_lifecycle.unwrap_or("runtime")
            }
            _ => file_lifecycle,
        };
        upsert_dep(
            deps,
            DepEntry {
                id: pkg_name.to_owned(),
                package_name: Some(pkg_name.to_owned()),
                version: ver,
                lifecycle,
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
    comp_dir: &Path,
    ws_config: &WorkspaceConfig,
    pkg_name: &str,
) -> Option<String> {
    for field in ["dependencies", "devDependencies", "peerDependencies"] {
        let ws_policy = &ws_config.dependency_resolver.policy[field][pkg_name];
        if let Some(ver) = ws_policy
            .as_str()
            .or_else(|| ws_policy["version"].as_str())
            .map(str::trim)
            .filter(|ver| !ver.is_empty() && *ver != "-")
        {
            return Some(ver.to_owned());
        }
    }
    for base in [comp_dir, root] {
        let pkg_json_path = base
            .join("node_modules")
            .join(pkg_name)
            .join("package.json");
        if let Ok(bytes) = fs::read(pkg_json_path)
            && let Ok(parsed) = bit_object_import::parse_jsonc(&bytes)
            && let Some(ver) = parsed["version"]
                .as_str()
                .map(str::trim)
                .filter(|ver| !ver.is_empty())
        {
            return Some(ver.to_owned());
        }
    }
    None
}

pub(super) fn remove_dep(deps: &mut Vec<DepEntry>, target: &str) {
    deps.retain(|dep| dep.id != target && dep.package_name.as_deref() != Some(target));
}

pub(super) fn upsert_dep(deps: &mut Vec<DepEntry>, entry: DepEntry) {
    if let Some(existing) = deps
        .iter_mut()
        .find(|dep| dep.id == entry.id || dep.package_name == entry.package_name)
    {
        if entry.dep_type == "component" {
            existing.id = entry.id;
            existing.dep_type = "component";
        } else if existing.dep_type == "component" && !entry.version.is_empty() {
            let bare = existing.id
                .split('@')
                .next()
                .unwrap_or(&existing.id);
            existing.id = format!("{bare}@{}", entry.version);
        }
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
