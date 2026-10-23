//! `bit deps get <component-name>` implementation (`dependencies-cmd.ts`).

use super::{
    resolve::{ResolvedDep, WorkspaceDepsContext},
    usage::TreeNode,
    usage_render::render_archy,
};
use crate::commands::{
    color::Chalk,
    debug_cat::lookup::load_cat_component,
    lane::scope_root::ScopeRoot,
    list::table,
    scope_set::{Failure, selection},
    set_peer::load_dep_resolver_config,
};
use bit_install::workspace::Bitmap;
use serde_json::Value;
use std::{
    collections::{HashSet, VecDeque},
    path::Path,
};

struct DepInfoRow {
    id: String,
    depth: usize,
    parent: String,
    dependency_type: &'static str,
}

pub(super) fn prepare_get(
    root: &Path,
    bitmap: &Bitmap,
    bitmap_val: &Value,
    id: &str,
    tree: bool,
    chalk: Chalk,
) -> Result<String, Failure> {
    let matched = selection::resolve_pattern_entries(root, bitmap, id, chalk)?;
    let [entry] = matched.as_slice() else {
        return Err(Failure::Declined("multiple entries for deps get".into()));
    };
    let id_with_ver = selection::entry_full_id(entry);
    let ctx = WorkspaceDepsContext::load(root)?;
    let component = ctx
        .find_workspace_component(entry)
        .ok_or_else(|| Failure::Declined("missing workspace component".into()))?;
    let current_cfg = load_dep_resolver_config(root, bitmap_val, entry)?;
    let (deps, _) = ctx.collect_component_deps(
        entry,
        component,
        current_cfg
            .as_ref()
            .and_then(|cfg| cfg.get("policy")),
    );
    let rows = collect_dep_info_rows(
        root,
        &ctx,
        bitmap_val,
        &id_with_ver,
        &deps,
        if tree { 64 } else { 8 },
    );
    render_get_result(&id_with_ver, &entry.id.to_string_without_version(), rows, tree, chalk)
}

fn render_get_result(
    id_with_ver: &str,
    id_without_ver: &str,
    rows: Vec<DepInfoRow>,
    tree: bool,
    chalk: Chalk,
) -> Result<String, Failure> {
    if tree {
        if rows.iter().any(|row| row.depth >= 64) {
            return Err(Failure::Declined("deps get tree depth exceeds native bound".into()));
        }
        let mut seen = HashSet::from([id_with_ver.to_owned()]);
        if rows
            .iter()
            .any(|row| !seen.insert(row.id.clone()))
        {
            return Err(Failure::Declined("deps get tree with shared or cyclic components".into()));
        }
        return Ok(render_dep_tree(id_with_ver, &rows));
    }
    if rows.is_empty() {
        return Ok(format!(
            "no dependencies found for {id_with_ver}.\ntry running \"bit cat-component {id_without_ver}\" to see whether the component/version exists locally",
        ));
    }
    Ok(render_dep_info_table(rows, chalk))
}

fn render_dep_tree(root_id: &str, rows: &[DepInfoRow]) -> String {
    let tree = assemble_dep_tree(root_id, rows);
    render_archy(&tree)
}

fn assemble_dep_tree(id: &str, rows: &[DepInfoRow]) -> TreeNode {
    let children = rows
        .iter()
        .filter(|row| row.parent == id)
        .map(|row| assemble_dep_tree(&row.id, rows))
        .collect();
    TreeNode {
        label: id
            .strip_suffix("@0.0.1-new")
            .unwrap_or(id)
            .to_owned(),
        children,
    }
}

fn render_dep_info_table(rows: Vec<DepInfoRow>, chalk: Chalk) -> String {
    let table_rows = rows
        .into_iter()
        .map(|row| vec![row.id, row.depth.to_string(), row.parent, row.dependency_type.to_owned()])
        .collect::<Vec<_>>();
    let rendered = table::render(
        &["Dependency ID", "Depth", "Immediate Dependent", "Dependency type"],
        &table_rows,
        chalk.enabled(),
    );
    format!("\n{}\n{rendered}", chalk.bold("Dependencies Details"))
}

fn collect_dep_info_rows(
    root: &Path,
    ctx: &WorkspaceDepsContext,
    bitmap_val: &Value,
    root_id: &str,
    direct_deps: &[ResolvedDep],
    max_depth: usize,
) -> Vec<DepInfoRow> {
    let mut rows = Vec::new();
    let mut visited = HashSet::from([root_id.to_owned()]);
    let mut queue = VecDeque::new();
    for dep in direct_deps {
        if dep.dep_type == "component" {
            let dep_type = lifecycle_to_dep_type(dep.lifecycle);
            push_dep_row(&mut rows, &mut visited, &mut queue, (&dep.id, 1, root_id, dep_type));
        }
    }
    while let Some((curr_id, depth)) = queue.pop_front() {
        if depth >= max_depth {
            continue;
        }
        for (child_id, dep_type) in child_component_deps(root, ctx, bitmap_val, &curr_id) {
            push_dep_row(
                &mut rows,
                &mut visited,
                &mut queue,
                (&child_id, depth + 1, &curr_id, dep_type),
            );
        }
    }
    rows
}

fn push_dep_row(
    rows: &mut Vec<DepInfoRow>,
    visited: &mut HashSet<String>,
    queue: &mut VecDeque<(String, usize)>,
    info: (&str, usize, &str, &'static str),
) {
    let (id, depth, parent, dependency_type) = info;
    rows.push(DepInfoRow { id: id.to_owned(), depth, parent: parent.to_owned(), dependency_type });
    if visited.insert(id.to_owned()) {
        queue.push_back((id.to_owned(), depth));
    }
}

fn lifecycle_to_dep_type(lifecycle: &str) -> &'static str {
    match lifecycle {
        "dev" => "dev",
        "peer" => "peer",
        _ => "prod",
    }
}

fn child_component_deps(
    root: &Path,
    ctx: &WorkspaceDepsContext,
    bitmap_val: &Value,
    comp_id: &str,
) -> Vec<(String, &'static str)> {
    let bare = comp_id
        .split('@')
        .next()
        .unwrap_or(comp_id);
    if let Some(children) = workspace_child_deps(root, ctx, bitmap_val, bare) {
        return children;
    }
    scope_child_deps(root, ctx, comp_id)
}

fn workspace_child_deps(
    root: &Path,
    ctx: &WorkspaceDepsContext,
    bitmap_val: &Value,
    bare: &str,
) -> Option<Vec<(String, &'static str)>> {
    let (entry, component) = ctx.ws.entries
        .iter()
        .zip(&ctx.ws.components)
        .find(|(entry, _)| entry.id.to_string_without_version() == bare)?;
    let cfg = load_dep_resolver_config(root, bitmap_val, entry).ok().flatten();
    let (deps, _) = ctx.collect_component_deps(
        entry,
        component,
        cfg.as_ref()
            .and_then(|val| val.get("policy")),
    );
    Some(
        deps.into_iter()
            .filter(|dep| dep.dep_type == "component")
            .map(|dep| (dep.id, lifecycle_to_dep_type(dep.lifecycle)))
            .collect(),
    )
}

fn scope_child_deps(
    root: &Path,
    ctx: &WorkspaceDepsContext,
    comp_id: &str,
) -> Vec<(String, &'static str)> {
    let scope_root = ScopeRoot { path: root.to_path_buf(), bare: false };
    let Some(ver_val) = load_cat_component(&scope_root, &ctx.ws.scope_path, comp_id) else {
        return Vec::new();
    };
    let mut children = Vec::new();
    for (field, kind) in [("dependencies", "prod"), ("devDependencies", "dev")] {
        let Some(arr) = ver_val[field].as_array() else { continue };
        for item in arr {
            if let Some(id_str) = format_scope_dep_id(&item["id"]) {
                children.push((id_str, kind));
            }
        }
    }
    children
}

fn format_scope_dep_id(id_val: &Value) -> Option<String> {
    let name = id_val["name"].as_str()?;
    let ver = id_val["version"].as_str().unwrap_or_default();
    let base = match id_val["scope"].as_str() {
        Some(scope) if !scope.is_empty() => format!("{scope}/{name}"),
        _ => name.to_owned(),
    };
    Some(if ver.is_empty() { base } else { format!("{base}@{ver}") })
}
