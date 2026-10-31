//! Native workspace `bit link` execution (`scopes/workspace/install/link/link.cmd.ts`).

use super::{
    Options,
    format::{BoundLink, ComponentLinkItem, LinkSummary, render_json, render_report},
    rewire, target,
};
use crate::{
    commands::{
        color::Chalk,
        inventory,
        workspace_command::{self, format::Formatter, results::Report},
    },
    native::Outcome,
};
use bit_install::{
    config::{WorkspaceConfig, aspect_id_without_version},
    dependencies::glob::match_patterns,
    links::{FileLink, link_prepared_component, prepared_package_manifest},
    model::{ComponentDependencies, ComponentId, Manifest, WorkspaceComponent},
    workspace::{BitmapEntry, Workspace},
};
use serde_json::{Value, json};
use std::{
    ffi::OsString,
    fs, io,
    path::{Path, PathBuf},
};

const CORE_ASPECT_IDS: &str =
    include_str!("../../../../../scopes/harmony/testing/load-aspect/core-aspects-ids.json");

const PRESERVED_MANIFEST_KEYS: &[&str] = &[
    "dependencies",
    "devDependencies",
    "peerDependencies",
    "optionalDependencies",
    "peerDependenciesMeta",
    "bit",
];

pub(super) fn try_run(
    root: &Path,
    cwd: &Path,
    args: &[OsString],
    options: &Options,
) -> io::Result<Option<Outcome>> {
    if root.join("merge-conflict").exists() {
        return Ok(None);
    }
    let Some((ws_config, ws, core_ids)) = load_eligible_workspace(root) else {
        return Ok(None);
    };
    let Some(selected) = select_components(&ws, &options.ids) else {
        return Ok(None);
    };
    let codemod_results =
        if options.rewire { rewire::rewire_components(&ws, &selected)? } else { Vec::new() };
    let (component_links, pkg_changed) =
        link_workspace_components(root, &ws_config, &ws, &selected)?;
    if pkg_changed || !codemod_results.is_empty() {
        invalidate_deps_cache(root, &selected)?;
    }
    let target_links = if let Some(target_arg) = options.target.as_deref() {
        let target_dir = resolve_target_dir(cwd, target_arg);
        target::link_to_target(root, &target_dir, &ws_config, &selected, options.peers)?
    } else {
        target::link_core_aspects(root, &ws_config, &ws, &core_ids)?;
        Vec::new()
    };
    let summary = LinkSummary {
        workspace_name: resolve_workspace_name(root, &ws_config),
        component_links,
        codemod_results,
        target_links,
    };
    finish_execution(root, args, options, &summary)
}

fn finish_execution(
    root: &Path,
    args: &[OsString],
    options: &Options,
    summary: &LinkSummary,
) -> io::Result<Option<Outcome>> {
    if options.json {
        let data = serde_json::to_string_pretty(&render_json(summary)).map_err(io::Error::other)?;
        let outcome =
            workspace_command::execute_without_loader_scope(root, args, "link", move |_| {
                Ok(Report { data, code: 0, details: None })
            })?;
        return Ok(Some(outcome));
    }
    let formatter = Formatter::new(Chalk::detect(args));
    let data = render_report(&formatter, summary, options);
    let outcome = workspace_command::execute_then(root, args, "link", move |_| {
        Ok(Report { data, code: 0, details: None })
    })?;
    Ok(Some(outcome))
}

fn load_eligible_workspace(root: &Path) -> Option<(WorkspaceConfig, Workspace, Vec<String>)> {
    let ws_config = WorkspaceConfig::load(root).ok()?;
    if ws_config.workspace.bitmap_auto_sync == Some(true) {
        return None;
    }
    let core_ids: Vec<String> = serde_json::from_str(CORE_ASPECT_IDS).ok()?;
    let ws = Workspace::load(root, &ws_config, &core_ids).ok()?;
    (!has_custom_package_hook(&ws, &core_ids)).then_some((ws_config, ws, core_ids))
}

fn has_custom_package_hook(ws: &Workspace, core_ids: &[String]) -> bool {
    let uses_custom_env = ws
        .active()
        .any(|(_, comp)| {
            let bare = aspect_id_without_version(&comp.env_id);
            !core_ids.iter().any(|id| id == bare)
        });
    uses_custom_env && ws.active().any(|(_, component)| component_has_package_hook(component))
}

fn component_has_package_hook(component: &WorkspaceComponent) -> bool {
    component.files
        .iter()
        .any(|rel_file| file_has_package_hook(&component.dir.join(rel_file)))
}

fn file_has_package_hook(path: &Path) -> bool {
    let Ok(text) = fs::read_to_string(path) else {
        return false;
    };
    text.contains("package(")
        || text.contains("getPackageJsonProps")
        || text.contains("modifyPackageJson")
        || text.contains("registerPackageJsonTransformer")
}

fn select_components<'a>(
    ws: &'a Workspace,
    selectors: &[String],
) -> Option<Vec<&'a WorkspaceComponent>> {
    let active: Vec<(&BitmapEntry, &WorkspaceComponent)> = ws
        .active()
        .filter(|(_, comp)| comp.root_dir != ".")
        .collect();
    if selectors.is_empty() {
        return Some(
            active
                .into_iter()
                .map(|(_, comp)| comp)
                .collect(),
        );
    }
    let mut matched: Vec<&'a WorkspaceComponent> = Vec::new();
    for selector in selectors {
        if !collect_matching_components(&active, selector, &mut matched) {
            return None;
        }
    }
    Some(matched)
}

fn collect_matching_components<'a>(
    active: &[(&BitmapEntry, &'a WorkspaceComponent)],
    selector: &str,
    matched: &mut Vec<&'a WorkspaceComponent>,
) -> bool {
    let mut found_any = false;
    for &(entry, comp) in active {
        if !matches_component(entry, comp, selector) {
            continue;
        }
        found_any = true;
        if !matched
            .iter()
            .any(|existing| existing.id == comp.id)
        {
            matched.push(comp);
        }
    }
    found_any
}

fn matches_component(entry: &BitmapEntry, comp: &WorkspaceComponent, selector: &str) -> bool {
    if matches_exact_identity(entry, comp, selector) {
        return true;
    }
    let normalized = inventory::normalize(selector);
    let dir = normalized
        .strip_prefix("./")
        .unwrap_or(&normalized)
        .trim_end_matches('/');
    let root_dir = entry.root_dir.trim_end_matches('/');
    if !root_dir.is_empty() && root_dir == dir {
        return true;
    }
    let bare_id = entry.id.to_string_without_version();
    let patterns = [selector.to_owned()];
    match_patterns(&bare_id, &patterns) || match_patterns(&entry.id.name, &patterns)
}

fn matches_exact_identity(entry: &BitmapEntry, comp: &WorkspaceComponent, selector: &str) -> bool {
    entry.id.to_string_without_version() == selector
        || format_component_id(&entry.id) == selector
        || entry.id.name == selector
        || entry.key == selector
        || comp.package_name == selector
}

fn link_workspace_components(
    root: &Path,
    ws_config: &WorkspaceConfig,
    ws: &Workspace,
    selected: &[&WorkspaceComponent],
) -> io::Result<(Vec<ComponentLinkItem>, bool)> {
    let bit_roots = ensure_bit_roots_dirs(root, ws_config, ws)?;
    let mut items = Vec::with_capacity(selected.len());
    let mut any_changed = false;
    for &component in selected {
        if component.root_dir == "." {
            continue;
        }
        let package_dir = root.join("node_modules").join(&component.package_name);
        let pkg_json_path = package_dir.join("package.json");
        let before = fs::read_to_string(&pkg_json_path).ok();
        let manifest = build_manifest(&package_dir, component);
        let linked =
            link_prepared_component(root, component, manifest.as_ref(), bit_roots.as_deref())?;
        if before != fs::read_to_string(&pkg_json_path).ok() {
            any_changed = true;
        }
        items.push(to_link_item(root, component, &linked.links));
    }
    Ok((items, any_changed))
}

fn ensure_bit_roots_dirs(
    root: &Path,
    ws_config: &WorkspaceConfig,
    ws: &Workspace,
) -> io::Result<Option<PathBuf>> {
    let bit_roots = ws_config.workspace.root_components_directory
        .as_deref()
        .map_or_else(
            || root.join("node_modules/.bit_roots"),
            |dir| root.join(dir).join(".bit_roots"),
        );
    if ws_config.dependency_resolver.has_root_components() {
        let all_bare_ids: Vec<String> = ws
            .active()
            .map(|(_, comp)| comp.id.to_string_without_version())
            .collect();
        for (_, comp) in ws
            .active()
            .filter(|(_, comp)| comp.root_dir != ".")
        {
            let bare_env = aspect_id_without_version(&comp.env_id);
            let env_name = if all_bare_ids
                .iter()
                .any(|id| id == bare_env)
            {
                bare_env
            } else {
                comp.env_id.as_str()
            };
            fs::create_dir_all(bit_roots.join(env_name.replace('/', "_")))?;
        }
        return Ok(Some(bit_roots));
    }
    Ok(bit_roots.is_dir().then_some(bit_roots))
}

fn build_manifest(package_dir: &Path, component: &WorkspaceComponent) -> Option<Manifest> {
    if component.has_package_json {
        return None;
    }
    let (props, is_aspect) = env_package_json_props(&component.env_id);
    let mut manifest = prepared_package_manifest(
        component,
        &ComponentDependencies::default(),
        &props,
        "bit.cloud",
        is_aspect,
    );
    if let Ok(bytes) = fs::read(package_dir.join("package.json"))
        && let Ok(Value::Object(existing)) = bit_object_import::parse_jsonc(&bytes)
    {
        for &key in PRESERVED_MANIFEST_KEYS {
            if let Some(val) = existing.get(key) {
                manifest.insert(key.to_owned(), val.clone());
            }
        }
    }
    Some(manifest)
}

fn env_package_json_props(env_id: &str) -> (Value, bool) {
    let base_env = aspect_id_without_version(env_id);
    if base_env == "teambit.harmony/empty-env" {
        return (json!({}), false);
    }
    let is_aspect = matches!(
        base_env,
        "teambit.harmony/aspect"
            | "teambit.harmony/envs/core-aspect-env"
            | "teambit.harmony/envs/core-aspect-env-jest"
            | "teambit.harmony/bit-custom-aspect",
    );
    if is_aspect {
        return (
            json!({
                "main": "dist/{main}.js",
                "types": "{main}.ts",
                "exports": {
                    "node": { "require": "./dist/{main}.js", "import": "./dist/esm.mjs" },
                    "default": "./dist/{main}.js",
                },
            }),
            true,
        );
    }
    (json!({ "main": "dist/{main}.js", "types": "{main}.ts" }), false)
}

fn to_link_item(
    root: &Path,
    component: &WorkspaceComponent,
    links: &[FileLink],
) -> ComponentLinkItem {
    let bound = links
        .iter()
        .map(|link| BoundLink {
            from: relative_display(root, &link.from),
            to: relative_display(root, &link.to),
            exists_before: link.existed_before,
        })
        .collect();
    ComponentLinkItem {
        id: format_component_id(&component.id),
        package_name: component.package_name.clone(),
        bound,
    }
}

pub(super) fn format_component_id(id: &ComponentId) -> String {
    let bare = id.to_string_without_version();
    match id.version
        .as_deref()
        .filter(|ver| !ver.is_empty() && !matches!(*ver, "latest" | "head"))
    {
        Some(ver) => format!("{bare}@{ver}"),
        None => bare,
    }
}

fn relative_display(root: &Path, path: &Path) -> String {
    path.strip_prefix(root)
        .unwrap_or(path)
        .to_string_lossy()
        .replace('\\', "/")
}

fn resolve_target_dir(cwd: &Path, target_arg: &str) -> PathBuf {
    let target_path = Path::new(target_arg);
    if target_path.is_absolute() { target_path.to_path_buf() } else { cwd.join(target_path) }
}

fn resolve_workspace_name(root: &Path, ws_config: &WorkspaceConfig) -> String {
    ws_config.workspace.name
        .as_deref()
        .map(str::trim)
        .filter(|name| !name.is_empty())
        .map(str::to_owned)
        .or_else(|| {
            root.file_name()
                .map(|name| name.to_string_lossy().into_owned())
        })
        .unwrap_or_else(|| "workspace".into())
}

fn invalidate_deps_cache(root: &Path, components: &[&WorkspaceComponent]) -> io::Result<()> {
    let cache = bit_object_import::scope_path(root).join("cache/components/deps");
    for &component in components {
        if component.root_dir != "." {
            let key = format_component_id(&component.id);
            bit_install::dependencies::cache::remove_entry(&cache, &key)?;
        }
    }
    Ok(())
}
