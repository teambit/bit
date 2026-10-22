//! Workspace component loading and eligibility checks for native `bit show`.

use super::{
    Options,
    deps::{self, DepEntry},
    render,
};
use crate::{
    commands::{
        inventory,
        scope_set::selection::valid_scope_str,
        workspace_command::{self, results::Report},
    },
    native::Outcome,
    workspace,
};
use bit_install::{
    config::{DEPENDENCY_RESOLVER_ASPECT, WorkspaceConfig, aspect_id_without_version},
    model::WorkspaceComponent,
    workspace::{BitmapEntry, ScopeObjects, Workspace},
};
use std::{ffi::OsString, io, path::Path};

const CORE_ASPECT_IDS: &str =
    include_str!("../../../../../scopes/harmony/testing/load-aspect/core-aspects-ids.json");

pub(super) struct LoadedComponent {
    pub entry: BitmapEntry,
    pub component: WorkspaceComponent,
    pub scope: String,
    pub main_file: String,
    pub deps: Vec<DepEntry>,
    pub is_removed: bool,
}

impl LoadedComponent {
    pub(super) fn full_id(&self) -> String {
        let base = if self.scope.is_empty() {
            self.entry.id.name.clone()
        } else {
            format!("{}/{}", self.scope, self.entry.id.name)
        };
        match self.entry.id.version.as_deref() {
            Some(ver) if !ver.is_empty() && ver != "latest" => format!("{base}@{ver}"),
            _ => base,
        }
    }
}

pub(super) fn try_run(
    cwd: &Path,
    args: &[OsString],
    options: &Options,
) -> io::Result<Option<Outcome>> {
    if options.remote || options.compare || options.browser || options.id.contains('@') {
        return Ok(None);
    }
    let Some(root) = workspace::root(cwd) else {
        return Ok(None);
    };
    let Some(loaded) = load_target(&root, options) else {
        return Ok(None);
    };
    match (options.json, options.legacy) {
        (true, true) => {
            let value = render::legacy_json(&loaded);
            let data = serde_json::to_string_pretty(&value)?;
            let outcome = workspace_command::execute_json(&root, args, "show", |_| {
                Ok(Report { data, code: 0, details: None })
            })?;
            Ok(Some(outcome))
        }
        (true, false) => {
            let value = render::harmony_json(&loaded);
            let data = serde_json::to_string_pretty(&value)?;
            let outcome = workspace_command::execute_json(&root, args, "show", |_| {
                Ok(Report { data, code: 0, details: None })
            })?;
            Ok(Some(outcome))
        }
        (false, false) => {
            let data = render::text_report(&loaded);
            let outcome = workspace_command::execute_then(&root, args, "show", |_| {
                Ok(Report { data, code: 0, details: None })
            })?;
            Ok(Some(outcome))
        }
        (false, true) => Ok(None),
    }
}

pub(super) fn load_target(root: &Path, options: &Options) -> Option<LoadedComponent> {
    if root.join("merge-conflict").exists() {
        return None;
    }
    let ws_config = WorkspaceConfig::load(root).ok()?;
    if !is_supported_workspace(&ws_config) {
        return None;
    }
    let core_ids: Vec<String> = serde_json::from_str(CORE_ASPECT_IDS).ok()?;
    let ws = Workspace::load(root, &ws_config, &core_ids).ok()?;
    if has_bitmap_peer_component(&ws) {
        return None;
    }
    let (entry, component) = find_component(&ws, &options.id)?;
    if !is_supported_component(entry, component) {
        return None;
    }
    let scope = entry.id
        .effective_scope()
        .or(ws_config.workspace.default_scope.as_deref())
        .unwrap_or_default()
        .to_owned();
    let main_file = resolve_main_file(entry, component);
    let model = ScopeObjects::new(&ws.scope_path)
        .component_or_head(&entry.id)
        .ok()
        .flatten();
    let deps =
        deps::collect_dependencies(root, &ws_config, &ws, entry, component, model.as_ref(), &scope);
    Some(LoadedComponent {
        entry: entry.clone(),
        component: component.clone(),
        scope,
        main_file,
        deps,
        is_removed: entry.is_removed(),
    })
}

fn is_supported_workspace(ws_config: &WorkspaceConfig) -> bool {
    if ws_config.workspace.bitmap_auto_sync == Some(true) {
        return false;
    }
    let Some(default_scope) = ws_config.workspace.default_scope.as_deref() else {
        return false;
    };
    if !valid_scope_str(default_scope) {
        return false;
    }
    let has_variant_dep_resolver = ws_config.variants
        .iter()
        .any(|(_, cfg)| {
            cfg.keys()
                .any(|key| aspect_id_without_version(key) == DEPENDENCY_RESOLVER_ASPECT)
        });
    let has_peer_policy = ws_config.dependency_resolver.policy
        .get("peerDependencies")
        .and_then(|pol| pol.as_object())
        .is_some_and(|map| !map.is_empty());
    !has_variant_dep_resolver && !has_peer_policy
}

fn has_bitmap_peer_component(ws: &Workspace) -> bool {
    ws.entries
        .iter()
        .any(|entry| {
            entry.config
                .as_ref()
                .and_then(|cfg| cfg.get(DEPENDENCY_RESOLVER_ASPECT))
                .is_some_and(|dep_cfg| {
                    dep_cfg.get("peer").is_some()
                        || dep_cfg
                            .get("policy")
                            .and_then(|pol| pol.get("peerDependencies"))
                            .is_some()
                })
        })
}

fn find_component<'a>(
    ws: &'a Workspace,
    raw_id: &str,
) -> Option<(&'a BitmapEntry, &'a WorkspaceComponent)> {
    ws.entries
        .iter()
        .zip(&ws.components)
        .find(|(entry, _)| entry.owns_its_dir() && matches_entry(entry, raw_id))
        .or_else(|| {
            ws.entries
                .iter()
                .zip(&ws.components)
                .find(|(entry, _)| matches_entry(entry, raw_id))
        })
}

fn matches_entry(entry: &BitmapEntry, raw_id: &str) -> bool {
    let normalized = inventory::normalize(raw_id);
    let dir = normalized.strip_prefix("./").unwrap_or(&normalized);
    entry.id.to_string_without_version() == raw_id
        || entry.id.name == raw_id
        || entry.key == raw_id
        || (!entry.root_dir.is_empty() && entry.root_dir == dir)
}

fn is_supported_component(entry: &BitmapEntry, component: &WorkspaceComponent) -> bool {
    if entry.id.version.is_some() {
        return false;
    }
    if aspect_id_without_version(&component.env_id) != "teambit.harmony/node" {
        return false;
    }
    let has_special_files = component.files
        .iter()
        .any(|file| file.contains(".spec.") || file.contains(".test.") || file.contains(".docs."));
    let has_special_aspect = component.config
        .keys()
        .any(|key| {
            matches!(
                aspect_id_without_version(key),
                "teambit.mdx/readme"
                    | "teambit.mdx/mdx"
                    | "teambit.component/internalize"
                    | "teambit.pipelines/builder",
            )
        });
    !has_special_files && !has_special_aspect
}

fn resolve_main_file(entry: &BitmapEntry, component: &WorkspaceComponent) -> String {
    if !entry.main_file.is_empty() {
        return entry.main_file.clone();
    }
    for candidate in ["index.ts", "index.tsx", "index.js", "index.jsx"] {
        if component.files
            .iter()
            .any(|file| file == candidate)
        {
            return candidate.to_owned();
        }
    }
    component.files
        .first()
        .cloned()
        .unwrap_or_else(|| "index.js".to_owned())
}
