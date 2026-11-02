//! External target directory linking (`bit link --target <dir> [--peers]`).
//!
//! Links [`WorkspaceComponent`] packages and peer dependencies from [`Workspace`] into [`LinkToDirResult`] and [`LinkDetail`] via [`link_to_target`].

use super::runner::format_component_id;
use crate::discovery::{self, Target};
use bit_install::{
    config::{DEPENDENCY_RESOLVER_ASPECT, WorkspaceConfig, aspect_id_without_version},
    model::WorkspaceComponent,
    workspace::Workspace,
};
use serde_json::Value;
use std::{
    fs, io,
    path::{Path, PathBuf},
};

/// Source (`from`) and destination (`to`) paths for a single package linked into `--target`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) struct LinkDetail {
    pub package_name: String,
    pub from: String,
    pub to: String,
}

/// Per-component or peer-package link entry returned by [`link_to_target`].
#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) struct LinkToDirResult {
    pub component_id: String,
    pub links_detail: LinkDetail,
}

/// Symlinks `selected` component packages (and optional `--peers` packages) into `target_dir/node_modules`.
pub(super) fn link_to_target(
    root: &Path,
    target_dir: &Path,
    ws_config: &WorkspaceConfig,
    selected: &[&WorkspaceComponent],
    include_peers: bool,
) -> io::Result<Vec<LinkToDirResult>> {
    let root_nm = root.join("node_modules");
    let target_nm = target_dir.join("node_modules");
    let mut results = Vec::with_capacity(selected.len());
    for &component in selected {
        let pkg_name = component.package_name.trim();
        if component.root_dir == "." || pkg_name.is_empty() {
            continue;
        }
        let from = root_nm.join(pkg_name);
        let to = target_nm.join(pkg_name);
        create_dir_symlink(&from, &to)?;
        results.push(LinkToDirResult {
            component_id: format_component_id(&component.id),
            links_detail: LinkDetail {
                package_name: pkg_name.to_owned(),
                from: from.to_string_lossy().into_owned(),
                to: to.to_string_lossy().into_owned(),
            },
        });
    }
    if include_peers {
        for peer_name in collect_peers(root, ws_config, selected) {
            let from = root_nm.join(&peer_name);
            let to = target_nm.join(&peer_name);
            create_dir_symlink(&from, &to)?;
            results.push(LinkToDirResult {
                component_id: peer_name.clone(),
                links_detail: LinkDetail {
                    package_name: peer_name,
                    from: from.to_string_lossy().into_owned(),
                    to: to.to_string_lossy().into_owned(),
                },
            });
        }
    }
    Ok(results)
}

/// Collects deduplicated peer dependency package names across `selected` components and their envs.
fn collect_peers(
    root: &Path,
    ws_config: &WorkspaceConfig,
    selected: &[&WorkspaceComponent],
) -> Vec<String> {
    let mut peers = Vec::new();
    for &component in selected {
        if component.root_dir == "." {
            continue;
        }
        let nm_pkg_json = root
            .join("node_modules")
            .join(&component.package_name)
            .join("package.json");
        add_package_json_peers(&nm_pkg_json, &mut peers);
        add_package_json_peers(&component.dir.join("package.json"), &mut peers);
        if let Some(dep_cfg) = component.config.get(DEPENDENCY_RESOLVER_ASPECT)
            && let Some(policy) = dep_cfg.get("policy")
        {
            add_policy_peers(policy, &mut peers);
        }
        add_env_peers(&component.env_id, &mut peers);
    }
    add_policy_peers(&ws_config.dependency_resolver.policy, &mut peers);
    peers
}

fn add_package_json_peers(path: &Path, peers: &mut Vec<String>) {
    let Ok(bytes) = fs::read(path) else {
        return;
    };
    let Ok(json) = bit_object_import::parse_jsonc(&bytes) else {
        return;
    };
    if let Some(Value::Object(peer_map)) = json.get("peerDependencies") {
        for key in peer_map.keys() {
            push_unique(peers, key);
        }
    }
}

#[inline]
fn add_policy_peers(policy: &Value, peers: &mut Vec<String>) {
    let Some(peer_deps) = policy.get("peerDependencies") else {
        return;
    };
    match peer_deps {
        Value::Object(map) => add_object_peers(map, peers),
        Value::Array(items) => add_array_peers(items, peers),
        _ => {}
    }
}

#[inline]
fn add_object_peers(map: &serde_json::Map<String, Value>, peers: &mut Vec<String>) {
    for (name, val) in map {
        if val.as_str().map(str::trim) != Some("-") {
            push_unique(peers, name);
        }
    }
}

#[inline]
fn add_array_peers(items: &[Value], peers: &mut Vec<String>) {
    for item in items {
        if let Some(name) = item.get("name").and_then(Value::as_str)
            && item
                .get("version")
                .and_then(Value::as_str)
                .map(str::trim)
                != Some("-")
        {
            push_unique(peers, name);
        }
    }
}

#[inline]
fn add_env_peers(env_id: &str, peers: &mut Vec<String>) {
    let base_env = aspect_id_without_version(env_id.trim()).trim();
    if matches!(
        base_env,
        "teambit.react/react"
            | "teambit.react/react-native"
            | "teambit.mdx/mdx"
            | "teambit.harmony/aspect"
            | "teambit.harmony/envs/core-aspect-env"
            | "teambit.harmony/envs/core-aspect-env-jest",
    ) || base_env.contains("react")
    {
        push_unique(peers, "react");
        push_unique(peers, "react-dom");
    }
}

#[inline]
fn push_unique(list: &mut Vec<String>, item: &str) {
    let item = item.trim();
    if !item.is_empty()
        && !list
            .iter()
            .any(|existing| existing == item)
    {
        list.push(item.to_owned());
    }
}

pub(super) fn link_core_aspects(
    root: &Path,
    ws_config: &WorkspaceConfig,
    ws: &Workspace,
    core_ids: &[String],
) -> io::Result<()> {
    if !ws_config.dependency_resolver.link_core_aspects() {
        return Ok(());
    }
    let Some(teambit_dir) = find_teambit_packages_dir(root) else {
        return Ok(());
    };
    let authored: Vec<String> = ws
        .active()
        .map(|(_, comp)| comp.id.to_string_without_version())
        .collect();
    let names = collect_core_package_names(core_ids, &authored);
    let root_teambit = root.join("node_modules/@teambit");
    let hoisted = root.join("node_modules/.pnpm");
    let hoisted_teambit = hoisted
        .is_dir()
        .then(|| hoisted.join("node_modules/@teambit"));
    for name in &names {
        let src = teambit_dir.join(name);
        if !src.exists() {
            continue;
        }
        link_aspect_if_allowed(&src, &root_teambit.join(name))?;
        if let Some(hoisted_dir) = &hoisted_teambit {
            link_aspect_if_allowed(&src, &hoisted_dir.join(name))?;
        }
    }
    Ok(())
}

fn collect_core_package_names(core_ids: &[String], authored: &[String]) -> Vec<String> {
    let mut names = vec!["bit".to_owned(), "legacy".to_owned(), "harmony".to_owned()];
    for id in core_ids {
        let id = id.trim();
        if id.is_empty()
            || authored
                .iter()
                .any(|existing| existing.trim() == id)
        {
            continue;
        }
        let sub_name = id
            .split('/')
            .skip(1)
            .map(str::trim)
            .filter(|seg| !seg.is_empty())
            .collect::<Vec<_>>()
            .join(".");
        push_unique(&mut names, &sub_name);
    }
    names
}

fn find_teambit_packages_dir(root: &Path) -> Option<PathBuf> {
    let Ok(Target::Entry(cli)) = discovery::find() else {
        return None;
    };
    let bit_dir = cli.bit_dir.as_ref()?;
    if bit_dir.starts_with(root) {
        return None;
    }
    if let Some(bvm) = &cli.bvm_link {
        let candidate = bvm.join("node_modules/@teambit");
        if candidate.is_dir() {
            return Some(candidate);
        }
    }
    let parent = bit_dir.parent()?;
    parent.is_dir().then(|| parent.to_path_buf())
}

#[inline]
fn link_aspect_if_allowed(src: &Path, dest: &Path) -> io::Result<()> {
    if let Ok(meta) = dest.symlink_metadata()
        && !meta.file_type().is_symlink()
    {
        return Ok(());
    }
    create_dir_symlink(src, dest)
}

pub(super) fn create_dir_symlink(from: &Path, to: &Path) -> io::Result<()> {
    if fs::read_link(to).is_ok_and(|existing| existing == from) && to.exists() {
        return Ok(());
    }
    if let Some(parent) = to
        .parent()
        .filter(|dir| !dir.as_os_str().is_empty())
    {
        fs::create_dir_all(parent)?;
    }
    remove_existing_target(to)?;
    #[cfg(unix)]
    {
        std::os::unix::fs::symlink(from, to)
    }
    #[cfg(windows)]
    {
        std::os::windows::fs::symlink_dir(from, to)
    }
}

#[inline]
fn remove_existing_target(to: &Path) -> io::Result<()> {
    let Ok(meta) = to.symlink_metadata() else {
        return Ok(());
    };
    if meta.is_dir() && !meta.file_type().is_symlink() {
        return fs::remove_dir_all(to);
    }
    fs::remove_file(to).or_else(|err| if cfg!(windows) { fs::remove_dir(to) } else { Err(err) })
}
