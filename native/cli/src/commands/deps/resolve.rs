//! Workspace component dependency resolution for `bit deps`.

use crate::commands::scope_set::Failure;
use bit_install::{
    config::{DEPENDENCY_RESOLVER_ASPECT, WorkspaceConfig},
    model::WorkspaceComponent,
    workspace::{BitmapEntry, ScopeObjects, Workspace},
};
use serde_json::Value;
use std::{
    fs,
    path::{Component, Path, PathBuf},
};

const CORE_ASPECT_IDS: &str =
    include_str!("../../../../../scopes/harmony/testing/load-aspect/core-aspects-ids.json");

#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) struct ResolvedDep {
    pub id: String,
    pub package_name: String,
    pub version: String,
    pub lifecycle: &'static str,
    pub dep_type: &'static str,
    pub comp_name: Option<String>,
    pub comp_bare_id: Option<String>,
    pub is_extension: bool,
}

pub(super) struct WorkspaceDepsContext {
    pub root: PathBuf,
    pub ws_config: WorkspaceConfig,
    pub ws: Workspace,
    pub objects: ScopeObjects,
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
        let stripped = split_pkg_to_name_and_ver(candidate).0;
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

pub(super) fn split_pkg_to_name_and_ver(raw: &str) -> (&str, Option<&str>) {
    if let Some(rest) = raw.strip_prefix('@') {
        match rest.find('@') {
            Some(idx) => (&raw[..=idx], Some(&raw[idx + 2..])),
            None => (raw, None),
        }
    } else {
        match raw.split_once('@') {
            Some((name, ver)) => (name, Some(ver)),
            None => (raw, None),
        }
    }
}

impl WorkspaceDepsContext {
    pub(super) fn load(root: &Path) -> Result<Self, Failure> {
        let ws_config =
            WorkspaceConfig::load(root).map_err(|err| Failure::Declined(err.to_string()))?;
        let core_ids: Vec<String> = serde_json::from_str(CORE_ASPECT_IDS)
            .map_err(|err| Failure::Declined(err.to_string()))?;
        let ws = Workspace::load(root, &ws_config, &core_ids)
            .map_err(|err| Failure::Declined(err.to_string()))?;
        let objects = ScopeObjects::new(&ws.scope_path);
        Ok(Self { root: root.to_path_buf(), ws_config, ws, objects })
    }

    pub(super) fn find_workspace_component<'a>(
        &'a self,
        entry: &BitmapEntry,
    ) -> Option<&'a WorkspaceComponent> {
        self.ws.entries
            .iter()
            .zip(&self.ws.components)
            .find(|(cand, _)| cand.key == entry.key && cand.root_dir == entry.root_dir)
            .map(|(_, comp)| comp)
            .or_else(|| {
                self.ws.components
                    .iter()
                    .find(|comp| comp.id.name == entry.id.name)
            })
    }

    pub(super) fn collect_component_deps(
        &self,
        entry: &BitmapEntry,
        component: &WorkspaceComponent,
        override_policy: Option<&Value>,
    ) -> (Vec<ResolvedDep>, Vec<String>) {
        let scope = entry.id
            .effective_scope()
            .or(self.ws_config.workspace.default_scope.as_deref())
            .unwrap_or_default();
        let identity =
            Identity { scope, name: &entry.id.name, package_name: &component.package_name };
        let mut deps = Vec::new();
        let mut missing = Vec::new();
        self.scan_files(entry, component, &identity, (&mut deps, &mut missing));
        if let Some(model) = self.objects
            .component_or_head(&entry.id)
            .ok()
            .flatten()
        {
            self.apply_model(&model, &identity, &mut deps);
        }
        self.apply_variants(entry, &identity, &mut deps);
        self.apply_component_json(&component.dir, &identity, &mut deps);
        if let Some(policy) = override_policy {
            self.apply_policy_object(policy, &identity, &mut deps);
        } else if let Some(cfg) =
            crate::commands::update_cmd::bitmap_entry_aspect(entry, DEPENDENCY_RESOLVER_ASPECT)
        {
            self.apply_policy_object(&cfg["policy"], &identity, &mut deps);
        }
        (deps, missing)
    }

    fn scan_files(
        &self,
        entry: &BitmapEntry,
        component: &WorkspaceComponent,
        identity: &Identity<'_>,
        out: (&mut Vec<ResolvedDep>, &mut Vec<String>),
    ) {
        let (deps, missing) = out;
        for rel_file in &component.files {
            for raw_spec in scanned_specifiers(&component.dir, rel_file) {
                if identity.is_self(&raw_spec) {
                    continue;
                }
                if raw_spec.starts_with('.') {
                    self.resolve_relative(entry, rel_file, &raw_spec, deps);
                } else {
                    self.resolve_package(identity, &raw_spec, deps, missing);
                }
            }
        }
    }

    fn resolve_relative(
        &self,
        entry: &BitmapEntry,
        rel_file: &str,
        raw_spec: &str,
        deps: &mut Vec<ResolvedDep>,
    ) {
        let base_dir = Path::new(&entry.root_dir)
            .join(rel_file)
            .parent()
            .map_or_else(PathBuf::new, Path::to_path_buf);
        let resolved = normalize_rel_path(&base_dir.join(raw_spec));
        if !entry.root_dir.is_empty() && resolved.starts_with(entry.root_dir.trim_end_matches('/'))
        {
            return;
        }
        if let Some(other) = self.ws.components
            .iter()
            .find(|comp| {
                comp.id != entry.id
                    && !comp.root_dir.is_empty()
                    && resolved.starts_with(comp.root_dir.trim_end_matches('/'))
            })
        {
            upsert_dep(deps, workspace_comp_dep(other, "runtime", None));
        }
    }

    fn resolve_package(
        &self,
        identity: &Identity<'_>,
        raw_spec: &str,
        deps: &mut Vec<ResolvedDep>,
        missing: &mut Vec<String>,
    ) {
        let pkg_name = extract_package_name(raw_spec);
        if identity.is_self(pkg_name) || pkg_name.starts_with("@teambit/") {
            return;
        }
        if let Some(other) = self.find_comp_by_pkg(pkg_name) {
            upsert_dep(deps, workspace_comp_dep(other, "runtime", None));
            return;
        }
        if let Some(comp_dep) = self.node_modules_comp_dep(pkg_name, "runtime", None) {
            upsert_dep(deps, comp_dep);
            return;
        }
        if let Some(ver) = self.lookup_package_version(pkg_name) {
            upsert_dep(deps, package_dep(pkg_name, &ver, "runtime"));
        } else if !missing
            .iter()
            .any(|item| item == pkg_name)
        {
            missing.push(pkg_name.to_owned());
        }
    }

    pub(super) fn find_comp_by_pkg(&self, pkg_name: &str) -> Option<&WorkspaceComponent> {
        self.ws.components
            .iter()
            .find(|comp| {
                let scope = comp.id.effective_scope().unwrap_or_default();
                comp.package_name == pkg_name
                    || format!("@{scope}/{}", comp.id.name) == pkg_name
                    || format!("@{scope}/{}", comp.id.name.replace('/', ".")) == pkg_name
            })
    }

    pub(super) fn node_modules_comp_dep(
        &self,
        pkg_name: &str,
        lifecycle: &'static str,
        override_ver: Option<&str>,
    ) -> Option<ResolvedDep> {
        let pkg_json = self.root
            .join("node_modules")
            .join(pkg_name)
            .join("package.json");
        let parsed: Value = bit_object_import::parse_jsonc(&fs::read(pkg_json).ok()?).ok()?;
        let comp_id = parsed.get("componentId")?;
        let (scope, name, id_ver) = parse_manifest_comp_id(comp_id)?;
        let ver = override_ver
            .or(id_ver)
            .or_else(|| parsed["version"].as_str())?;
        let bare = format!("{scope}/{name}");
        Some(ResolvedDep {
            id: format!("{bare}@{ver}"),
            package_name: pkg_name.to_owned(),
            version: ver.to_owned(),
            lifecycle,
            dep_type: "component",
            comp_name: Some(name.to_owned()),
            comp_bare_id: Some(bare),
            is_extension: false,
        })
    }

    fn lookup_package_version(&self, pkg_name: &str) -> Option<String> {
        let ws_policy = &self.ws_config.dependency_resolver.policy["dependencies"][pkg_name];
        if let Some(ver) = ws_policy
            .as_str()
            .or_else(|| ws_policy["version"].as_str())
        {
            return Some(ver.to_owned());
        }
        let pkg_json = self.root
            .join("node_modules")
            .join(pkg_name)
            .join("package.json");
        let parsed: Value = bit_object_import::parse_jsonc(&fs::read(pkg_json).ok()?).ok()?;
        parsed["version"].as_str().map(str::to_owned)
    }
}

pub(super) fn parse_manifest_comp_id(comp_id: &Value) -> Option<(&str, &str, Option<&str>)> {
    if let (Some(scope), Some(name)) = (comp_id["scope"].as_str(), comp_id["name"].as_str()) {
        return Some((scope, name, comp_id["version"].as_str()));
    }
    let raw = comp_id.as_str()?;
    let (bare, ver) = raw
        .rsplit_once('@')
        .map_or((raw, None), |(bare, ver)| (bare, Some(ver)));
    let (scope, name) = bare.split_once('/')?;
    (!scope.is_empty() && !name.is_empty()).then_some((
        scope,
        name,
        ver.filter(|val| !val.is_empty()),
    ))
}

pub(super) fn scanned_specifiers(comp_dir: &Path, rel_file: &str) -> Vec<String> {
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

pub(super) fn workspace_comp_dep(
    other: &WorkspaceComponent,
    lifecycle: &'static str,
    override_ver: Option<&str>,
) -> ResolvedDep {
    let ver = override_ver
        .map(str::to_owned)
        .or_else(|| other.id.version.clone())
        .unwrap_or_else(|| "0.0.1-new".to_owned());
    let bare = other.id.to_string_without_version();
    ResolvedDep {
        id: format!("{bare}@{ver}"),
        package_name: other.package_name.clone(),
        version: ver,
        lifecycle,
        dep_type: "component",
        comp_name: Some(other.id.name.clone()),
        comp_bare_id: Some(bare),
        is_extension: false,
    }
}

pub(super) fn package_dep(pkg_name: &str, ver: &str, lifecycle: &'static str) -> ResolvedDep {
    ResolvedDep {
        id: pkg_name.to_owned(),
        package_name: pkg_name.to_owned(),
        version: ver.to_owned(),
        lifecycle,
        dep_type: "package",
        comp_name: None,
        comp_bare_id: None,
        is_extension: false,
    }
}

pub(super) fn upsert_dep(deps: &mut Vec<ResolvedDep>, entry: ResolvedDep) {
    if let Some(existing) = deps
        .iter_mut()
        .find(|dep| dep.package_name == entry.package_name || dep.id == entry.id)
    {
        existing.version = entry.version;
        existing.lifecycle = entry.lifecycle;
        if entry.dep_type == "component" {
            existing.dep_type = "component";
            existing.id = entry.id;
            existing.comp_name = entry.comp_name;
            existing.comp_bare_id = entry.comp_bare_id;
        }
    } else {
        deps.push(entry);
    }
}
