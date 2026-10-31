//! `bit deps write [--target=workspace.jsonc|package.json]` implementation.

use super::resolve::WorkspaceDepsContext;
use crate::{
    commands::{
        scope_set::Failure,
        set_peer::{DEP_RESOLVER_ID, load_dep_resolver_config},
        workspace_command,
    },
    workspace,
};
use bit_install::{
    config::DEPENDENCY_RESOLVER_ASPECT, dependencies::cache::invalidation::deps_dir, policy,
};
use bit_workspace_config::package_json::{detect_indent, detect_newline, stringify_package};
use node_semver::npm;
use serde_json::{Map, Value, json};
use std::{
    cmp::Ordering,
    collections::HashSet,
    fs, io,
    path::{Path, PathBuf},
};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(in crate::commands) enum WriteTarget {
    WorkspaceJsonc,
    PackageJson,
}

#[derive(Clone)]
struct CandidateRow {
    name: String,
    range: String,
    root: bool,
}

pub(super) fn prepare_write(
    root: &Path,
    bitmap_val: &Value,
    target: WriteTarget,
) -> Result<(PathBuf, WriteTarget, Map<String, Value>), Failure> {
    let ctx = WorkspaceDepsContext::load(root)?;
    let mut rows = Vec::new();
    let root_policy = policy::workspace_policy(
        &ctx.ws_config.dependency_resolver,
        ctx.ws.root_package_json.as_ref(),
        None,
    );
    let mut root_names = HashSet::new();
    for entry in root_policy {
        if entry.version != "-" {
            root_names.insert(entry.name.clone());
            rows.push(CandidateRow { name: entry.name, range: entry.version, root: true });
        }
    }
    collect_variant_and_comp_policies(root, &ctx, bitmap_val, &mut rows)?;
    collect_comp_dep_rows(root, &ctx, bitmap_val, &root_names, &mut rows)?;
    let deduped = dedupe_rows(&rows)?;
    Ok((root.to_path_buf(), target, deduped))
}

fn collect_variant_and_comp_policies(
    root: &Path,
    ctx: &WorkspaceDepsContext,
    bitmap_val: &Value,
    rows: &mut Vec<CandidateRow>,
) -> Result<(), Failure> {
    for (_, variant_map) in &ctx.ws_config.variants {
        if let Some(cfg) = variant_map.get(DEPENDENCY_RESOLVER_ASPECT) {
            push_policy_rows(&cfg["policy"], rows);
        }
    }
    for entry in &ctx.ws.entries {
        if !entry.owns_its_dir() {
            continue;
        }
        if let Some(cfg) = load_dep_resolver_config(root, bitmap_val, entry)? {
            push_policy_rows(&cfg["policy"], rows);
        }
    }
    Ok(())
}

fn push_policy_rows(policy_val: &Value, rows: &mut Vec<CandidateRow>) {
    for field in ["dependencies", "devDependencies", "peerDependencies"] {
        let Some(entries) = policy_val[field].as_object() else { continue };
        for (name, val) in entries {
            let name = name.trim();
            let Some(ver) = val
                .as_str()
                .or_else(|| val["version"].as_str())
                .map(str::trim)
            else {
                continue;
            };
            if !name.is_empty() && !ver.is_empty() && ver != "-" {
                rows.push(CandidateRow {
                    name: name.to_owned(),
                    range: ver.to_owned(),
                    root: false,
                });
            }
        }
    }
}

fn collect_comp_dep_rows(
    root: &Path,
    ctx: &WorkspaceDepsContext,
    bitmap_val: &Value,
    root_names: &HashSet<String>,
    rows: &mut Vec<CandidateRow>,
) -> Result<(), Failure> {
    let local_pkgs: HashSet<&str> = ctx.ws.components
        .iter()
        .map(|comp| comp.package_name.as_str())
        .collect();
    for (entry, component) in ctx.ws.entries.iter().zip(&ctx.ws.components) {
        if !entry.owns_its_dir() {
            continue;
        }
        let cfg = load_dep_resolver_config(root, bitmap_val, entry)?;
        let (deps, _) = ctx.collect_component_deps(
            entry,
            component,
            cfg.as_ref()
                .and_then(|val| val.get("policy")),
        );
        for dep in deps {
            if dep.is_extension
                || dep.lifecycle == "peer"
                || local_pkgs.contains(dep.package_name.as_str())
                || root_names.contains(&dep.package_name)
                || npm::valid_range(&dep.version).is_none()
            {
                continue;
            }
            rows.push(CandidateRow { name: dep.package_name, range: dep.version, root: false });
        }
    }
    Ok(())
}

fn dedupe_rows(rows: &[CandidateRow]) -> Result<Map<String, Value>, Failure> {
    let mut selected: Map<String, Value> = Map::new();
    let mut selected_root: HashSet<String> = HashSet::new();
    for row in rows {
        if !row.name.trim().is_empty() {
            apply_candidate_row(&mut selected, &mut selected_root, row)?;
        }
    }
    Ok(selected)
}

fn apply_candidate_row(
    selected: &mut Map<String, Value>,
    selected_root: &mut HashSet<String>,
    row: &CandidateRow,
) -> Result<(), Failure> {
    let replace = match selected.get(&row.name).and_then(Value::as_str) {
        None => true,
        Some(old_range) if old_range == row.range => false,
        Some(old_range) => {
            let old_is_root = selected_root.contains(&row.name);
            should_overwrite((old_range, old_is_root), (&row.range, row.root))?
        }
    };
    if replace {
        if row.root {
            selected_root.insert(row.name.clone());
        } else {
            selected_root.remove(&row.name);
        }
        selected.insert(row.name.clone(), Value::String(row.range.clone()));
    }
    Ok(())
}

fn should_overwrite(old: (&str, bool), incoming: (&str, bool)) -> Result<bool, Failure> {
    if old.1 && !incoming.1 {
        return Ok(false);
    }
    if !old.1 && incoming.1 {
        return Ok(true);
    }
    let left = npm::min_version(incoming.0).map_err(|_| Failure::Declined("invalid range".into()))?;
    let right = npm::min_version(old.0).map_err(|_| Failure::Declined("invalid range".into()))?;
    Ok(left
        .zip(right)
        .is_some_and(|(left_ver, right_ver)| left_ver.compare(&right_ver) == Ordering::Greater))
}

pub(super) fn commit_write(
    root: &Path,
    target: WriteTarget,
    dependencies: &Map<String, Value>,
) -> io::Result<String> {
    match target {
        WriteTarget::PackageJson => write_to_package_json(root, dependencies)?,
        WriteTarget::WorkspaceJsonc => write_to_workspace_jsonc(root, dependencies)?,
    }
    let _ = fs::remove_dir_all(deps_dir(root));
    Ok(String::new())
}

fn write_to_package_json(root: &Path, dependencies: &Map<String, Value>) -> io::Result<()> {
    let path = root.join("package.json");
    let text = match fs::read_to_string(&path) {
        Ok(text) => text,
        Err(err) if err.kind() == io::ErrorKind::NotFound => String::from("{}"),
        Err(err) => return Err(err),
    };
    let mut value: Value =
        bit_object_import::parse_jsonc(text.as_bytes()).map_err(io::Error::other)?;
    let obj = value
        .as_object_mut()
        .ok_or_else(|| io::Error::other("package.json must hold an object"))?;
    let deps_val = obj
        .entry("dependencies")
        .or_insert_with(|| Value::Object(Map::new()));
    let deps_obj = deps_val
        .as_object_mut()
        .ok_or_else(|| io::Error::other("package.json dependencies must be an object"))?;
    for (name, range) in dependencies {
        deps_obj.insert(name.clone(), range.clone());
    }
    let serialized = stringify_package(&value, &detect_indent(&text), detect_newline(&text))?;
    fs::write(&path, serialized)
}

fn write_to_workspace_jsonc(root: &Path, dependencies: &Map<String, Value>) -> io::Result<()> {
    let mut entries = dependencies
        .iter()
        .map(|(name, value)| (name.clone(), value.clone()))
        .collect::<Vec<_>>();
    entries.sort_by(|(left, _), (right, _)| left.encode_utf16().cmp(right.encode_utf16()));
    let sorted: pnpm_lockfile::LockfileExtra = entries.into_iter().collect();
    bit_install::command::edit_workspace_config(
        root,
        &workspace::scope_path(root),
        &workspace_command::file_id(),
        "Write dependencies",
        move |document| {
            document.replace_entries(&[DEP_RESOLVER_ID, "policy", "dependencies"], &sorted);
            document.replace_entries(
                &[DEP_RESOLVER_ID, "policy", "peerDependencies"],
                &pnpm_lockfile::LockfileExtra::new(),
            );
            if document
                .get(&[DEP_RESOLVER_ID, "linkCoreAspects"])
                .is_none()
            {
                document.set(&[DEP_RESOLVER_ID, "linkCoreAspects"], &json!(true));
            }
        },
    )
}
