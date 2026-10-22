//! Workspace component loading and eligibility checks for native `bit show`.

use super::{
    Options,
    deps::{self, CompContext, DepEntry},
    remote_show, render,
};
use crate::{
    commands::{
        debug_cat::lookup::resolve_component_entry,
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
    workspace::{BitmapEntry, ModelData, ScopeObjects, Workspace, sha1_hex},
};
use serde_json::Value;
use std::{ffi::OsString, io, path::Path};

const CORE_ASPECT_IDS: &str =
    include_str!("../../../../../scopes/harmony/testing/load-aspect/core-aspects-ids.json");
const IMPORT_PENDING: &str = r#"your workspace has outdated objects. please use "bit import" to pull the latest objects from the remote scope."#;

pub(super) struct LoadedComponent {
    pub entry: BitmapEntry,
    pub component: WorkspaceComponent,
    pub scope: String,
    pub main_file: String,
    pub deps: Vec<DepEntry>,
    pub model_extensions: Vec<Value>,
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

pub(super) enum TargetOutcome {
    Loaded(Box<LoadedComponent>),
    OutdatedObjects,
    Declined,
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
    if let Some(err_msg) = invalid_default_scope_error(&root) {
        let outcome = workspace_command::execute_then(&root, args, "show", move |_| {
            Err(io::Error::other(err_msg))
        })?;
        return Ok(Some(outcome));
    }
    match load_target_outcome(&root, options) {
        TargetOutcome::Loaded(loaded) => render_workspace_outcome(&root, args, options, &loaded),
        TargetOutcome::OutdatedObjects => {
            let outcome = workspace_command::execute_then(&root, args, "show", |_| {
                Err(io::Error::other(IMPORT_PENDING))
            })?;
            Ok(Some(outcome))
        }
        TargetOutcome::Declined => Ok(None),
    }
}

fn render_workspace_outcome(
    root: &Path,
    args: &[OsString],
    options: &Options,
    loaded: &LoadedComponent,
) -> io::Result<Option<Outcome>> {
    match (options.json, options.legacy) {
        (true, true) => {
            let data = serde_json::to_string_pretty(&render::legacy_json(loaded))?;
            let outcome = workspace_command::execute_json(root, args, "show", |_| {
                Ok(Report { data, code: 0, details: None })
            })?;
            Ok(Some(outcome))
        }
        (true, false) => {
            let data = serde_json::to_string_pretty(&render::harmony_json(loaded))?;
            let outcome = workspace_command::execute_json(root, args, "show", |_| {
                Ok(Report { data, code: 0, details: None })
            })?;
            Ok(Some(outcome))
        }
        (false, _) => {
            let data = render::text_report(loaded);
            let outcome = workspace_command::execute_then(root, args, "show", |_| {
                Ok(Report { data, code: 0, details: None })
            })?;
            Ok(Some(outcome))
        }
    }
}

fn invalid_default_scope_error(root: &Path) -> Option<String> {
    let ws_config = WorkspaceConfig::load(root).ok()?;
    let default_scope = ws_config.workspace.default_scope.as_deref()?;
    (!default_scope.is_empty() && !valid_scope_str(default_scope)).then(|| {
        format!(
            r#"error: "{default_scope}" is invalid, component scope names can only contain alphanumeric, lowercase characters, and the following ["-", "_", "$", "!"]"#,
        )
    })
}

pub(super) fn load_target_outcome(root: &Path, options: &Options) -> TargetOutcome {
    if root.join("merge-conflict").exists() {
        return TargetOutcome::Declined;
    }
    let Ok(ws_config) = WorkspaceConfig::load(root) else {
        return TargetOutcome::Declined;
    };
    if !is_supported_workspace(&ws_config) {
        return TargetOutcome::Declined;
    }
    let Ok(core_ids) = serde_json::from_str::<Vec<String>>(CORE_ASPECT_IDS) else {
        return TargetOutcome::Declined;
    };
    let Ok(ws) = Workspace::load(root, &ws_config, &core_ids) else {
        return TargetOutcome::Declined;
    };
    if has_bitmap_peer_component(&ws) {
        return TargetOutcome::Declined;
    }
    let Some((entry, component)) = find_component(&ws, &options.id) else {
        if !options.json
            && ws.entries.is_empty()
            && let Some(loaded) = remote_show::load_from_local_scope(&ws.scope_path, &options.id)
        {
            return TargetOutcome::Loaded(Box::new(loaded));
        }
        return TargetOutcome::Declined;
    };
    build_workspace_target(root, &ws_config, &ws, entry, component)
}

fn build_workspace_target(
    root: &Path,
    ws_config: &WorkspaceConfig,
    ws: &Workspace,
    entry: &BitmapEntry,
    component: &WorkspaceComponent,
) -> TargetOutcome {
    let scope = entry.id
        .effective_scope()
        .or(ws_config.workspace.default_scope.as_deref())
        .unwrap_or_default()
        .to_owned();
    let (model, ver_val) = load_local_model(&ws.scope_path, &scope, entry);
    if let Some(outcome) = missing_local_version_outcome(root, entry, ver_val.as_ref()) {
        return outcome;
    }
    if !is_supported_component(entry, component) {
        return TargetOutcome::Declined;
    }
    let main_file = resolve_main_file(entry, component);
    let ctx =
        CompContext { root, ws_config, ws, entry, component, model: model.as_ref(), scope: &scope };
    let deps = deps::collect_dependencies(&ctx);
    let model_extensions = model.map(|data| data.extensions).unwrap_or_default();
    TargetOutcome::Loaded(Box::new(LoadedComponent {
        entry: entry.clone(),
        component: component.clone(),
        scope,
        main_file,
        deps,
        model_extensions,
        is_removed: entry.is_removed(),
    }))
}

fn missing_local_version_outcome(
    root: &Path,
    entry: &BitmapEntry,
    ver_val: Option<&Value>,
) -> Option<TargetOutcome> {
    let ver = entry.id.version
        .as_deref()
        .filter(|ver| !ver.is_empty())?;
    if ver_val.is_some() {
        return None;
    }
    let Some(scope) = entry.id.scope
        .as_deref()
        .filter(|scope| !scope.is_empty())
    else {
        return Some(TargetOutcome::Declined);
    };
    if remote_show::remote_has_version(root, scope, &entry.id.name, ver) {
        Some(TargetOutcome::OutdatedObjects)
    } else {
        Some(TargetOutcome::Declined)
    }
}

fn load_local_model(
    scope_dir: &Path,
    scope: &str,
    entry: &BitmapEntry,
) -> (Option<ModelData>, Option<Value>) {
    let model = ScopeObjects::new(scope_dir)
        .component_or_head(&entry.id)
        .ok()
        .flatten();
    let ver_val = read_local_version_object(scope_dir, scope, entry);
    (model, ver_val)
}

fn read_local_version_object(scope_dir: &Path, scope: &str, entry: &BitmapEntry) -> Option<Value> {
    let bare_id =
        if scope.is_empty() { entry.id.name.clone() } else { format!("{scope}/{}", entry.id.name) };
    let comp_hash = resolve_component_entry(scope_dir, &bare_id)
        .or_else(|| resolve_component_entry(scope_dir, &entry.id.name))
        .map_or_else(|| sha1_hex(&bare_id), |(_, _, hash)| hash);
    let (kind, comp_val) =
        bit_object_import::read_scope_object(scope_dir, &comp_hash).ok().flatten()?;
    if kind != "Component" {
        return None;
    }
    let (_, ver_hash) = remote_show::resolve_scope_version(&comp_val, entry.id.version.as_deref())?;
    let (ver_kind, ver_val) =
        bit_object_import::read_scope_object(scope_dir, &ver_hash).ok().flatten()?;
    (ver_kind == "Version").then_some(ver_val)
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
        .and_then(Value::as_object)
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
    let env_bare = aspect_id_without_version(&component.env_id);
    if !matches!(env_bare, "teambit.harmony/node" | "teambit.mdx/readme" | "teambit.mdx/mdx") {
        return false;
    }
    let has_special_aspect = component.config
        .keys()
        .any(|key| {
            matches!(
                aspect_id_without_version(key),
                "teambit.component/internalize"
                    | "teambit.pipelines/builder"
                    | "teambit.component/deprecation",
            )
        });
    if has_special_aspect {
        return false;
    }
    true
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
