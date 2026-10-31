//! `bit deps usage <dependency-name>` implementation (`dependencies.main.runtime.ts`).

use super::{
    parse::snap_to_semver,
    resolve::{ResolvedDep, WorkspaceDepsContext, split_pkg_to_name_and_ver},
    usage_render::{
        compare_versions, format_name_ver, importer_tree_node, name_ver_from_dep_path,
        node_sort_key, render_archy, render_summary, resolve_display_name,
    },
};
use crate::commands::{
    color::Chalk, scope_set::Failure, set_peer::load_dep_resolver_config,
    workspace_command::format::Formatter,
};
use bit_install::{model::WorkspaceComponent, workspace::BitmapEntry};
use pnpm_lockfile::{Lockfile, PkgNameVerPeer};
use serde_json::Value;
use std::{
    collections::{HashMap, HashSet, VecDeque},
    path::Path,
};

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub(super) enum NodeId {
    Importer(String),
    Package(PkgNameVerPeer),
}

type ReverseMap = HashMap<NodeId, Vec<(NodeId, String)>>;

pub(super) struct TreeNode {
    pub label: String,
    pub children: Vec<TreeNode>,
}

pub(super) struct MatchedTree {
    pub display_name: String,
    pub version: String,
    pub node: TreeNode,
}

pub(super) fn prepare_usage(
    root: &Path,
    bitmap_val: &Value,
    dep_name: &str,
    depth: Option<usize>,
    chalk: Chalk,
) -> Result<String, Failure> {
    let dep_name = dep_name.trim();
    if !is_component_id(dep_name) {
        return find_usages_in_lockfile(root, dep_name, depth, chalk);
    }
    find_usages_in_workspace(root, bitmap_val, dep_name, chalk)
}

fn is_component_id(dep_name: &str) -> bool {
    let trimmed = dep_name.trim();
    !trimmed.is_empty() && trimmed.contains('/') && !trimmed.starts_with('@')
}

fn find_usages_in_workspace(
    root: &Path,
    bitmap_val: &Value,
    dep_name: &str,
    chalk: Chalk,
) -> Result<String, Failure> {
    let ctx = WorkspaceDepsContext::load(root)?;
    let mut lines = Vec::new();
    for (entry, component) in ctx.ws.entries.iter().zip(&ctx.ws.components) {
        if let Some(line) = match_component_dep_usage(
            &ctx,
            (root, bitmap_val),
            (entry, component),
            (dep_name, chalk),
        )? {
            lines.push(line);
        }
    }
    if lines.is_empty() {
        let formatter = Formatter::new(chalk);
        let msg = format!("the specified dependency {dep_name} is not used by any component");
        return Ok(formatter.hint(&msg));
    }
    Ok(lines.join("\n"))
}

fn match_component_dep_usage(
    ctx: &WorkspaceDepsContext,
    io_ctx: (&Path, &Value),
    comp: (&BitmapEntry, &WorkspaceComponent),
    query: (&str, Chalk),
) -> Result<Option<String>, Failure> {
    let (entry, component) = comp;
    if !entry.owns_its_dir() {
        return Ok(None);
    }
    let cfg = load_dep_resolver_config(io_ctx.0, io_ctx.1, entry)?;
    let (deps, _) = ctx.collect_component_deps(
        entry,
        component,
        cfg.as_ref()
            .and_then(|val| val.get("policy")),
    );
    let (name, req_ver) = split_pkg_to_name_and_ver(query.0);
    let Some(dep) = deps.iter().find(|dep| dep_matches_query(dep, name, req_ver)) else {
        return Ok(None);
    };
    let comp_id = crate::commands::scope_set::selection::entry_full_id(entry);
    Ok(Some(format!("{} (using dep in version {})", query.1.bold(&comp_id), dep.version)))
}

fn dep_matches_query(dep: &ResolvedDep, name: &str, req_ver: Option<&str>) -> bool {
    let name = name.trim();
    let name_ok = dep.package_name == name
        || dep.id == name
        || dep.comp_name.as_deref() == Some(name)
        || dep.comp_bare_id.as_deref() == Some(name);
    name_ok && req_ver.is_none_or(|ver| dep.version == ver || snap_to_semver(ver) == dep.version)
}

fn find_usages_in_lockfile(
    root: &Path,
    dep_name: &str,
    max_depth: Option<usize>,
    chalk: Chalk,
) -> Result<String, Failure> {
    let Some(lockfile) = load_workspace_lockfile(root)? else {
        return Ok(String::new());
    };
    let (visited, reverse_map) = build_reverse_graph(&lockfile);
    let mut trees = collect_matched_trees(
        root,
        &lockfile,
        &visited,
        &reverse_map,
        (dep_name, max_depth, chalk),
    );
    if trees.is_empty() {
        return Ok(String::new());
    }
    trees.sort_by(|left, right| {
        left.display_name
            .cmp(&right.display_name)
            .then_with(|| compare_versions(&left.version, &right.version))
    });
    let rendered = trees
        .iter()
        .map(|tree| render_archy(&tree.node).trim_end_matches('\n').to_owned())
        .collect::<Vec<_>>()
        .join("\n\n");
    let summary = render_summary(&trees);
    Ok(if summary.is_empty() { rendered } else { format!("{rendered}\n\n{summary}") })
}

fn load_workspace_lockfile(root: &Path) -> Result<Option<Lockfile>, Failure> {
    let current = Lockfile::load_current_from_install_state_dir(&root.join("node_modules/.pnpm"))
        .map_err(|err| Failure::Declined(err.to_string()))?;
    if current.is_some() {
        return Ok(current);
    }
    Lockfile::load_wanted_from_dir(root).map_err(|err| Failure::Declined(err.to_string()))
}

fn build_reverse_graph(lockfile: &Lockfile) -> (HashSet<NodeId>, ReverseMap) {
    let mut visited = HashSet::new();
    let mut reverse_map: ReverseMap = HashMap::new();
    let mut queue = VecDeque::new();
    for importer_id in lockfile.importers.keys() {
        if !importer_id.contains(".bit_roots") {
            let node = NodeId::Importer(importer_id.clone());
            visited.insert(node.clone());
            queue.push_back(node);
        }
    }
    while let Some(node) = queue.pop_front() {
        for (alias, target) in outgoing_edges(lockfile, &node) {
            reverse_map
                .entry(target.clone())
                .or_default()
                .push((node.clone(), alias));
            if visited.insert(target.clone()) {
                queue.push_back(target);
            }
        }
    }
    (visited, reverse_map)
}

fn outgoing_edges(lockfile: &Lockfile, node: &NodeId) -> Vec<(String, NodeId)> {
    match node {
        NodeId::Importer(importer_id) => importer_outgoing_edges(lockfile, importer_id),
        NodeId::Package(dep_path) => package_outgoing_edges(lockfile, dep_path),
    }
}

fn importer_outgoing_edges(lockfile: &Lockfile, importer_id: &str) -> Vec<(String, NodeId)> {
    let Some(importer) = lockfile.importers.get(importer_id) else {
        return Vec::new();
    };
    let groups =
        [&importer.dependencies, &importer.dev_dependencies, &importer.optional_dependencies];
    groups
        .into_iter()
        .flatten()
        .flat_map(|group| {
            group
                .iter()
                .filter_map(|(alias, spec)| {
                    let key = spec.version.resolved_key(alias)?;
                    Some((alias.to_string(), NodeId::Package(key)))
                })
        })
        .collect()
}

fn package_outgoing_edges(lockfile: &Lockfile, dep_path: &PkgNameVerPeer) -> Vec<(String, NodeId)> {
    let Some(snapshot) = lockfile.snapshots
        .as_ref()
        .and_then(|map| map.get(dep_path))
    else {
        return Vec::new();
    };
    [&snapshot.dependencies, &snapshot.optional_dependencies]
        .into_iter()
        .flatten()
        .flat_map(|group| {
            group
                .iter()
                .filter_map(|(alias, dep_ref)| {
                    let key = dep_ref.resolve(alias)?;
                    Some((alias.to_string(), NodeId::Package(key)))
                })
        })
        .collect()
}

fn collect_matched_trees(
    root: &Path,
    lockfile: &Lockfile,
    visited: &HashSet<NodeId>,
    reverse_map: &ReverseMap,
    query: (&str, Option<usize>, Chalk),
) -> Vec<MatchedTree> {
    let mut trees = Vec::new();
    for node_id in visited {
        if let Some(tree) = build_matched_tree((root, lockfile, reverse_map), node_id, query) {
            trees.push(tree);
        }
    }
    trees
}

fn build_matched_tree(
    env: (&Path, &Lockfile, &ReverseMap),
    node_id: &NodeId,
    query: (&str, Option<usize>, Chalk),
) -> Option<MatchedTree> {
    let (root, lockfile, reverse_map) = env;
    let NodeId::Package(dep_path) = node_id else { return None };
    if !lockfile.snapshots
        .as_ref()
        .is_some_and(|map| map.contains_key(dep_path))
    {
        return None;
    }
    let (name, version) = name_ver_from_dep_path(lockfile, dep_path);
    if !package_matches_query(reverse_map, node_id, (&name, &version), query.0) {
        return None;
    }
    let display_name = resolve_display_name(root, &name);
    let mut walk_state = (HashSet::from([node_id.clone()]), HashSet::new());
    let children = walk_reverse(env, node_id, &mut walk_state, (0, query.1, query.2));
    Some(MatchedTree {
        display_name: display_name.clone(),
        version: version.clone(),
        node: TreeNode { label: query.2.bold(&format_name_ver(&display_name, &version)), children },
    })
}

fn package_matches_query(
    reverse_map: &ReverseMap,
    node_id: &NodeId,
    pkg: (&str, &str),
    dep_name: &str,
) -> bool {
    let (query_name, query_ver) = split_pkg_to_name_and_ver(dep_name);
    let query_name = query_name.trim();
    let name_ok = pkg.0.trim() == query_name
        || reverse_map
            .get(node_id)
            .is_some_and(|edges| {
                edges
                    .iter()
                    .any(|(_, alias)| alias.trim() == query_name)
            });
    name_ok && version_matches_query(pkg.1, query_ver)
}

fn version_matches_query(version: &str, query_ver: Option<&str>) -> bool {
    let Some(req) = query_ver
        .map(str::trim)
        .filter(|req| !req.is_empty())
    else {
        return true;
    };
    let version = version.trim();
    if version == req {
        return true;
    }
    node_semver::Range::parse(req)
        .ok()
        .zip(node_semver::Version::parse(version).ok())
        .is_some_and(|(range, ver)| range.satisfies(&ver))
}

fn walk_reverse(
    env: (&Path, &Lockfile, &ReverseMap),
    node_id: &NodeId,
    state: &mut (HashSet<NodeId>, HashSet<NodeId>),
    depth_info: (usize, Option<usize>, Chalk),
) -> Vec<TreeNode> {
    let (depth, max_depth, _) = depth_info;
    if depth >= 64 || max_depth.is_some_and(|limit| depth >= limit) {
        return Vec::new();
    }
    let Some(edges) = env.2.get(node_id) else {
        return Vec::new();
    };
    let mut sorted = edges.iter().collect::<Vec<_>>();
    sorted.sort_by_key(|(left, _)| node_sort_key(env.0, left));
    sorted
        .into_iter()
        .map(|(parent, alias)| expand_reverse_edge(env, (parent, alias), state, depth_info))
        .collect()
}

fn expand_reverse_edge(
    env: (&Path, &Lockfile, &ReverseMap),
    edge: (&NodeId, &str),
    state: &mut (HashSet<NodeId>, HashSet<NodeId>),
    depth_info: (usize, Option<usize>, Chalk),
) -> TreeNode {
    match edge.0 {
        NodeId::Importer(importer_id) => {
            importer_tree_node(env.0, env.1, importer_id, edge.1, depth_info.2)
        }
        NodeId::Package(dep_path) => {
            expand_package_parent(env, (edge.0, dep_path), state, depth_info)
        }
    }
}

fn expand_package_parent(
    env: (&Path, &Lockfile, &ReverseMap),
    pkg: (&NodeId, &PkgNameVerPeer),
    state: &mut (HashSet<NodeId>, HashSet<NodeId>),
    depth_info: (usize, Option<usize>, Chalk),
) -> TreeNode {
    let (name, version) = name_ver_from_dep_path(env.1, pkg.1);
    let label = format_name_ver(&resolve_display_name(env.0, &name), &version);
    if state.0.contains(pkg.0) {
        return TreeNode { label: format!("{label} [circular]"), children: Vec::new() };
    }
    if state.1.contains(pkg.0) {
        return TreeNode { label: format!("{label} [deduped]"), children: Vec::new() };
    }
    state.0.insert(pkg.0.clone());
    state.1.insert(pkg.0.clone());
    let next_depth = (depth_info.0 + 1, depth_info.1, depth_info.2);
    let children = walk_reverse(env, pkg.0, state, next_depth);
    state.0.remove(pkg.0);
    TreeNode { label, children }
}
