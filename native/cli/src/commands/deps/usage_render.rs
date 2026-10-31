//! Rendering and manifest helpers for `bit deps usage`.

use super::usage::{MatchedTree, NodeId, TreeNode};
use crate::commands::color::Chalk;
use pnpm_lockfile::{Lockfile, PkgNameVerPeer, ProjectSnapshot};
use std::{collections::HashMap, fs, path::Path};

pub(super) fn importer_tree_node(
    root: &Path,
    lockfile: &Lockfile,
    importer_id: &str,
    alias: &str,
    chalk: Chalk,
) -> TreeNode {
    let (name, version) = read_importer_manifest(root, importer_id);
    let dep_field = lockfile.importers
        .get(importer_id)
        .and_then(|imp| importer_dep_field(imp, alias))
        .unwrap_or("dependencies");
    TreeNode {
        label: format!("{} ({dep_field})", chalk.bold(&format_name_ver(&name, &version))),
        children: Vec::new(),
    }
}

fn importer_dep_field(importer: &ProjectSnapshot, alias: &str) -> Option<&'static str> {
    let has = |group: Option<&pnpm_lockfile::ResolvedDependencyMap>| {
        group.is_some_and(|deps| {
            deps.keys()
                .any(|key| key.to_string() == alias)
        })
    };
    if has(importer.dev_dependencies.as_ref()) {
        Some("devDependencies")
    } else if has(importer.optional_dependencies.as_ref()) {
        Some("optionalDependencies")
    } else if has(importer.dependencies.as_ref()) {
        Some("dependencies")
    } else {
        None
    }
}

pub(super) fn read_importer_manifest(root: &Path, importer_id: &str) -> (String, String) {
    let dir = if importer_id == "." { root.to_path_buf() } else { root.join(importer_id) };
    let parsed = fs::read(dir.join("package.json"))
        .ok()
        .and_then(|bytes| bit_object_import::parse_jsonc(&bytes).ok());
    let name = parsed
        .as_ref()
        .and_then(|val| val["name"].as_str())
        .map(str::trim)
        .filter(|name| !name.is_empty())
        .map_or_else(
            || {
                if importer_id == "." {
                    "the root project".to_owned()
                } else {
                    importer_id.to_owned()
                }
            },
            str::to_owned,
        );
    let version = parsed
        .as_ref()
        .and_then(|val| val["version"].as_str())
        .map(str::trim)
        .unwrap_or_default()
        .to_owned();
    (name, version)
}

pub(super) fn resolve_display_name(root: &Path, pkg_name: &str) -> String {
    let pkg_name = pkg_name.trim();
    let pkg_json = root
        .join("node_modules")
        .join(pkg_name)
        .join("package.json");
    if let Ok(bytes) = fs::read(pkg_json)
        && let Ok(parsed) = bit_object_import::parse_jsonc(&bytes)
        && let Some(comp_id) = parsed.get("componentId")
        && let Some((scope, name, _)) = super::resolve::parse_manifest_comp_id(comp_id)
    {
        return format!("{scope}/{name}");
    }
    pkg_name.to_owned()
}

pub(super) fn node_sort_key(root: &Path, node: &NodeId) -> (String, String) {
    match node {
        NodeId::Importer(importer_id) => {
            (read_importer_manifest(root, importer_id).0, format!("importer:{importer_id}"))
        }
        NodeId::Package(dep_path) => (dep_path.name.to_string(), format!("pkg:{dep_path}")),
    }
}

pub(super) fn name_ver_from_dep_path(
    lockfile: &Lockfile,
    dep_path: &PkgNameVerPeer,
) -> (String, String) {
    let version = lockfile.packages
        .as_ref()
        .and_then(|packages| packages.get(&dep_path.without_peer()))
        .and_then(|metadata| metadata.version.clone())
        .unwrap_or_else(|| dep_path.suffix.version().to_string());
    (dep_path.name.to_string(), version)
}

pub(super) fn compare_versions(left: &str, right: &str) -> std::cmp::Ordering {
    match (node_semver::Version::parse(left), node_semver::Version::parse(right)) {
        (Ok(left_ver), Ok(right_ver)) => left_ver.cmp(&right_ver),
        _ => left.cmp(right),
    }
}

pub(super) fn format_name_ver(name: &str, version: &str) -> String {
    let name = name.trim();
    let version = version.trim();
    if version.is_empty() { name.to_owned() } else { format!("{name}@{version}") }
}

pub(super) fn render_archy(node: &TreeNode) -> String {
    let mut out = String::new();
    render_archy_node(node, "", "", &mut out);
    out
}

fn render_archy_node(node: &TreeNode, connector: &str, prefix: &str, out: &mut String) {
    out.push_str(connector);
    out.push_str(&node.label);
    out.push('\n');
    for (index, child) in node.children.iter().enumerate() {
        let last = index + 1 == node.children.len();
        let (child_conn, child_prefix) =
            child_archy_frames(prefix, last, !child.children.is_empty());
        render_archy_node(child, &child_conn, &child_prefix, out);
    }
}

fn child_archy_frames(prefix: &str, last: bool, has_children: bool) -> (String, String) {
    let branch = if last { "\u{2514}" } else { "\u{251c}" };
    let stem = if has_children { "\u{252c}" } else { "\u{2500}" };
    let child_prefix = if last { format!("{prefix}  ") } else { format!("{prefix}\u{2502} ") };
    let child_conn = format!("{prefix}{branch}\u{2500}{stem} ");
    (child_conn, child_prefix)
}

pub(super) fn render_summary(trees: &[MatchedTree]) -> String {
    let mut order = Vec::new();
    let mut by_name: HashMap<String, (Vec<String>, usize)> = HashMap::new();
    for tree in trees {
        let entry = by_name
            .entry(tree.display_name.clone())
            .or_insert_with(|| {
                order.push(tree.display_name.clone());
                (Vec::new(), 0)
            });
        if !entry.0.contains(&tree.version) {
            entry.0.push(tree.version.clone());
        }
        entry.1 += 1;
    }
    order
        .into_iter()
        .map(|name| {
            let (versions, count) = &by_name[&name];
            let ver_len = versions.len();
            let mut parts =
                vec![format!("{ver_len} version{}", if ver_len == 1 { "" } else { "s" })];
            if *count > ver_len {
                parts.push(format!("{count} instances"));
            }
            format!("Found {} of {name}", parts.join(", "))
        })
        .collect::<Vec<_>>()
        .join("\n")
}
