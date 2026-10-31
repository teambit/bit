//! Workspace component dependency graph builder for `bit graph`.

use super::{
    Options,
    model::{CompGraph, write_svg_file},
};
use crate::{
    commands::{
        debug_cat::lookup::resolve_component_entry,
        scope_set::{Failure, selection},
        script::resolve_workspace_components,
        workspace_command::format::Formatter,
    },
    workspace,
};
use bit_install::{
    config::DEPENDENCY_RESOLVER_ASPECT, model::WorkspaceComponent, workspace::Workspace,
};
use serde_json::{Value, json};
use std::{fs, path::Path};

pub(super) fn execute_workspace_graph(
    root: &Path,
    options: &Options,
    formatter: &Formatter,
) -> Result<String, Failure> {
    let (_, ws) =
        resolve_workspace_components(root).map_err(|err| Failure::Declined(err.to_string()))?;
    let scope_dir = workspace::scope_path(root);
    let local_ids: Vec<String> = ws
        .active()
        .map(|(entry, _)| selection::entry_full_id(entry))
        .collect();
    let seeders = if let Some(ref raw_id) = options.id {
        vec![resolve_seeder_id(&ws, raw_id)?]
    } else {
        local_ids.clone()
    };
    let mut graph = build_full_graph(&scope_dir, &ws);
    if options.id.is_some() {
        graph.filter_to_seeders(&seeders);
    }
    if !options.include_dependencies {
        graph.filter_local_only(&local_ids);
    }
    if options.cycles && !options.json {
        graph.filter_cycles();
    }
    graph.sort_deterministic();
    if options.json {
        let payload = json!({
            "nodes": graph.nodes,
            "edges": graph.edges,
        });
        return serde_json::to_string_pretty(&payload)
            .map_err(|err| Failure::Declined(err.to_string()));
    }
    let svg_path = write_svg_file(&graph)?;
    Ok(formatter.success_summary(&format!("image created at {}", svg_path.display())))
}

/// Build the same workspace ID graph used by `GraphBuilder.getGraphIds` for insights.
pub(crate) fn insight_graph(root: &Path) -> Result<(CompGraph, Vec<String>), Failure> {
    let (_, ws) =
        resolve_workspace_components(root).map_err(|err| Failure::Declined(err.to_string()))?;
    let scope_dir = workspace::scope_path(root);
    if has_unimported_npm_bit_dep(root, &scope_dir, &ws) {
        return Err(Failure::Declined("unimported npm bit component".into()));
    }
    let seeders = ws
        .active()
        .map(|(entry, _)| selection::entry_full_id(entry))
        .collect();
    Ok((build_full_graph(&scope_dir, &ws), seeders))
}

fn has_unimported_npm_bit_dep(root: &Path, scope_dir: &Path, ws: &Workspace) -> bool {
    for (_, comp) in ws.active() {
        for rel_file in &comp.files {
            let Ok(source) = fs::read_to_string(comp.dir.join(rel_file)) else { continue };
            let Ok(scanned) = bit_dependency_scanner::scan_source(rel_file.clone(), source) else {
                continue;
            };
            let Some(specifiers) = scanned["dependencies"].as_object() else { continue };
            if specifiers
                .keys()
                .any(|spec| is_unimported_npm_spec(root, scope_dir, ws, &comp.id.name, spec))
            {
                return true;
            }
        }
    }
    false
}

fn is_unimported_npm_spec(
    root: &Path,
    scope_dir: &Path,
    ws: &Workspace,
    self_name: &str,
    raw_spec: &str,
) -> bool {
    if match_ws_dep(ws, self_name, raw_spec).is_some() {
        return false;
    }
    let Some(dep_id) = npm_bit_dep_id(root, raw_spec) else {
        return false;
    };
    read_version_by_dep_id(scope_dir, &dep_id).is_none()
}

fn npm_bit_dep_id(root: &Path, raw_spec: &str) -> Option<String> {
    let pkg_name = if raw_spec.starts_with('@') {
        let mut parts = raw_spec.splitn(3, '/');
        let scope = parts.next()?;
        let name = parts.next()?;
        format!("{scope}/{name}")
    } else {
        raw_spec.split('/').next()?.to_owned()
    };
    let bytes = fs::read(
        root.join("node_modules")
            .join(pkg_name)
            .join("package.json"),
    )
    .ok()?;
    let val = bit_object_import::parse_jsonc(&bytes).ok()?;
    format_dep_id(&val["componentId"])
}

fn resolve_seeder_id(ws: &Workspace, raw_id: &str) -> Result<String, Failure> {
    let raw_id = raw_id.trim();
    let (bare, explicit_ver) = raw_id
        .rsplit_once('@')
        .map_or((raw_id, None), |(id, ver)| (id.trim(), Some(ver.trim())));
    let normalized = bare.trim_start_matches("./").trim_end_matches('/');
    let Some((entry, _)) = ws
        .active()
        .find(|(entry, comp)| {
            entry.id.to_string_without_version() == bare
                || comp.id.name == bare
                || (!entry.root_dir.is_empty() && entry.root_dir == normalized)
                || selection::entry_full_id(entry) == raw_id
        })
    else {
        return Err(Failure::Declined("graph target id not found in workspace".into()));
    };
    if let Some(ver) = explicit_ver.filter(|ver| !matches!(*ver, "" | "latest" | "head")) {
        return Ok(format!("{}@{ver}", entry.id.to_string_without_version()));
    }
    Ok(selection::entry_full_id(entry))
}

pub(super) fn build_full_graph(scope_dir: &Path, ws: &Workspace) -> CompGraph {
    let mut graph = CompGraph::default();
    for (entry, comp) in ws.active() {
        let node_id = selection::entry_full_id(entry);
        graph.add_node(node_id.clone());
        populate_ws_comp_edges(scope_dir, ws, comp, &node_id, &mut graph);
    }
    graph
}

fn populate_ws_comp_edges(
    scope_dir: &Path,
    ws: &Workspace,
    comp: &WorkspaceComponent,
    node_id: &str,
    graph: &mut CompGraph,
) {
    if let Some(ver_val) = load_ws_comp_version(scope_dir, comp) {
        add_version_graph_edges(scope_dir, node_id, &ver_val, graph);
    }
    add_scanned_ws_dep_edges(ws, comp, node_id, graph);
}

fn load_ws_comp_version(scope_dir: &Path, comp: &WorkspaceComponent) -> Option<Value> {
    let ver = comp.id.version
        .as_deref()
        .filter(|ver| !ver.is_empty())?;
    let identity = comp.id.to_string_without_version();
    let (_, _, comp_hash) = resolve_component_entry(scope_dir, &identity)
        .or_else(|| resolve_component_entry(scope_dir, &comp.id.name))?;
    read_comp_version_by_hash(scope_dir, &comp_hash, ver)
}

fn read_comp_version_by_hash(scope_dir: &Path, comp_hash: &str, ver: &str) -> Option<Value> {
    let (_, comp_val) = bit_object_import::read_scope_object(scope_dir, comp_hash).ok()??;
    let ver_hash = resolve_ver_hash(&comp_val, ver)?;
    let (v_kind, ver_val) = bit_object_import::read_scope_object(scope_dir, &ver_hash).ok()??;
    (v_kind == "Version").then_some(ver_val)
}

fn add_scanned_ws_dep_edges(
    ws: &Workspace,
    comp: &WorkspaceComponent,
    node_id: &str,
    graph: &mut CompGraph,
) {
    for rel_file in &comp.files {
        let Ok(source) = fs::read_to_string(comp.dir.join(rel_file)) else { continue };
        let Ok(scanned) = bit_dependency_scanner::scan_source(rel_file.clone(), source) else {
            continue;
        };
        let Some(specifiers) = scanned["dependencies"].as_object() else { continue };
        for raw_spec in specifiers.keys() {
            if let Some(target_id) = match_ws_dep(ws, &comp.id.name, raw_spec) {
                graph.add_edge(node_id.to_owned(), target_id, "prod");
            }
        }
    }
}

fn add_version_graph_edges(
    scope_dir: &Path,
    node_id: &str,
    ver_val: &Value,
    graph: &mut CompGraph,
) {
    if try_add_saved_graph_edges(ver_val, graph) {
        return;
    }
    let groups = [
        ("dependencies", "prod"),
        ("devDependencies", "dev"),
        ("peerDependencies", "peer"),
        ("extensionDependencies", "ext"),
    ];
    for (field, attr) in groups {
        let Some(arr) = ver_val[field].as_array() else { continue };
        for item in arr {
            if let Some(dep_id) = format_dep_id(item) {
                graph.add_edge(node_id.to_owned(), dep_id.clone(), attr);
                load_transitive_dep_edges(scope_dir, &dep_id, graph);
            }
        }
    }
    add_extension_graph_edges(scope_dir, node_id, ver_val, graph);
}

fn add_extension_graph_edges(
    scope_dir: &Path,
    node_id: &str,
    ver_val: &Value,
    graph: &mut CompGraph,
) {
    for ext in ver_val["extensions"]
        .as_array()
        .into_iter()
        .flatten()
    {
        if let Some(ext_id) = ext.get("extensionId")
            && let Some(dep_id) = format_dep_id(ext_id)
        {
            graph.add_edge(node_id.to_owned(), dep_id.clone(), "ext");
            load_transitive_dep_edges(scope_dir, &dep_id, graph);
        }
    }
}

fn try_add_saved_graph_edges(ver_val: &Value, graph: &mut CompGraph) -> bool {
    let Some(exts) = ver_val["extensions"].as_array() else { return false };
    let Some(dep_ext) = exts
        .iter()
        .find(|ext| crate::commands::update_cmd::matches_aspect(ext, DEPENDENCY_RESOLVER_ASPECT))
    else {
        return false;
    };
    let Some(saved_edges) = dep_ext["data"]["dependenciesGraph"]["edges"].as_array() else {
        return false;
    };
    if saved_edges.is_empty() {
        return false;
    }
    for edge in saved_edges {
        if let (Some(src), Some(dst), Some(attr)) =
            (edge["sourceId"].as_str(), edge["targetId"].as_str(), edge["attr"].as_str())
        {
            graph.add_edge(src.to_owned(), dst.to_owned(), attr);
        }
    }
    true
}

fn load_transitive_dep_edges(scope_dir: &Path, dep_id: &str, graph: &mut CompGraph) {
    let Some(ver_val) = read_version_by_dep_id(scope_dir, dep_id) else { return };
    for (field, attr) in
        [("dependencies", "prod"), ("devDependencies", "dev"), ("extensionDependencies", "ext")]
    {
        let Some(arr) = ver_val[field].as_array() else { continue };
        for item in arr {
            if let Some(child_id) = format_dep_id(item) {
                graph.add_edge(dep_id.to_owned(), child_id, attr);
            }
        }
    }
}

fn read_version_by_dep_id(scope_dir: &Path, dep_id: &str) -> Option<Value> {
    let (bare, ver) = dep_id
        .rsplit_once('@')
        .map_or((dep_id, "latest"), |(id, ver)| (id, ver));
    let (_, _, comp_hash) = resolve_component_entry(scope_dir, bare)
        .or_else(|| {
            let (_, name) = bare.split_once('/')?;
            resolve_component_entry(scope_dir, name)
        })?;
    read_comp_version_by_hash(scope_dir, &comp_hash, ver)
}

fn match_ws_dep(ws: &Workspace, self_name: &str, raw_spec: &str) -> Option<String> {
    for (entry, other) in ws.active() {
        if other.id.name == self_name {
            continue;
        }
        let scope = other.id.effective_scope().unwrap_or_default();
        let pkg_slash = format!("@{scope}/{}", other.id.name);
        let pkg_dot = format!("@{scope}/{}", other.id.name.replace('/', "."));
        if raw_spec == other.package_name
            || raw_spec == pkg_slash
            || raw_spec == pkg_dot
            || raw_spec.starts_with(&format!("{}/", other.package_name))
            || raw_spec.starts_with(&format!("{pkg_slash}/"))
            || raw_spec.starts_with(&format!("{pkg_dot}/"))
        {
            return Some(selection::entry_full_id(entry));
        }
    }
    None
}

pub(crate) fn resolve_ver_hash(comp_val: &Value, ver: &str) -> Option<String> {
    if matches!(ver, "" | "latest" | "head") {
        return comp_val["head"].as_str().map(str::to_owned);
    }
    comp_val["versions"]
        .get(ver)
        .and_then(Value::as_str)
        .or_else(|| comp_val["orphanedVersions"].get(ver).and_then(Value::as_str))
        .map(str::to_owned)
        .or_else(|| {
            (ver.len() == 40 && ver.bytes().all(|byte| byte.is_ascii_hexdigit())).then(|| {
                ver.to_owned()
            })
        })
}

pub(crate) fn format_dep_id(id_val: &Value) -> Option<String> {
    if let Some(raw) = id_val
        .as_str()
        .filter(|raw| !raw.is_empty())
    {
        return Some(raw.to_owned());
    }
    let inner = id_val
        .get("id")
        .filter(|val| val.is_object())
        .unwrap_or(id_val);
    let raw_name = inner["name"]
        .as_str()
        .or_else(|| id_val["name"].as_str())
        .filter(|name| !name.is_empty())?;
    let (name, inline_ver) = raw_name
        .rsplit_once('@')
        .map_or((raw_name, ""), |(nm, ver)| (nm, ver));
    let ver = inner["version"]
        .as_str()
        .or_else(|| id_val["version"].as_str())
        .or_else(|| inner["head"].as_str())
        .or_else(|| id_val["head"].as_str())
        .filter(|ver| !ver.is_empty())
        .unwrap_or(inline_ver);
    let base = match inner["scope"]
        .as_str()
        .or_else(|| id_val["scope"].as_str())
        .filter(|scope| !scope.is_empty())
    {
        Some(scope) => format!("{scope}/{name}"),
        None => name.to_owned(),
    };
    Some(if ver.is_empty() { base } else { format!("{base}@{ver}") })
}
