//! Scope and workspace dependency graph construction and traversal for `bit dependents`.

use super::{
    Options, find_existing_bitmap_entry,
    render::{DepGraph, render_dependents_report},
};
use crate::{
    commands::{
        aspect::workspace_default_scope,
        color::Chalk,
        debug_cat::lookup::resolve_component_entry,
        scope_set::{Failure, selection},
        script::resolve_workspace_components,
    },
    workspace,
};
use bit_install::{
    model::WorkspaceComponent,
    workspace::{Bitmap, Workspace},
};
use serde_json::{Value, json};
use std::{collections::HashMap, fs, path::Path};

pub(super) fn run_dependents_query(
    root: &Path,
    options: &Options,
    chalk: Chalk,
) -> Result<String, Failure> {
    let bitmap = load_workspace_bitmap(root)?;
    let (_, ws) =
        resolve_workspace_components(root).map_err(|err| Failure::Declined(err.to_string()))?;
    let scope_dir = workspace::scope_path(root);
    let (target_id, bare_id) = resolve_target_id(&scope_dir, &bitmap, &options.id)?;
    let scope_dependents = build_scope_graph(&scope_dir).dependents_of(&target_id);
    let workspace_dependents = build_workspace_graph(&scope_dir, &ws).dependents_of(&target_id);
    if options.json {
        let payload = json!({
            "scopeDependents": scope_dependents,
            "workspaceDependents": workspace_dependents,
            "id": target_id,
        });
        return serde_json::to_string_pretty(&payload)
            .map_err(|err| Failure::Declined(err.to_string()));
    }
    Ok(render_dependents_report(
        &target_id,
        &bare_id,
        &workspace_dependents,
        &scope_dependents,
        chalk,
    ))
}

fn load_workspace_bitmap(root: &Path) -> Result<Bitmap, Failure> {
    let ws_bytes =
        fs::read(root.join("workspace.jsonc")).map_err(|err| Failure::Declined(err.to_string()))?;
    let ws_val = bit_object_import::parse_jsonc(&ws_bytes)
        .map_err(|err| Failure::Declined(err.to_string()))?;
    if ws_val["teambit.workspace/workspace"]["bitmapAutoSync"] == true {
        return Err(Failure::Declined("bitmapAutoSync enabled".into()));
    }
    let default_scope = workspace_default_scope(&ws_val)?;
    Bitmap::load(root, Some(&default_scope)).map_err(|err| Failure::Declined(err.to_string()))
}

fn resolve_target_id(
    scope_dir: &Path,
    bitmap: &Bitmap,
    raw_id: &str,
) -> Result<(String, String), Failure> {
    let (bare, explicit_ver) = raw_id
        .rsplit_once('@')
        .map_or((raw_id, None), |(id, ver)| (id, Some(ver)));
    if let Some(entry) = find_existing_bitmap_entry(bitmap, bare) {
        let identity = entry.id.to_string_without_version();
        let ver = explicit_ver.or(entry.id.version.as_deref());
        let full = match ver {
            Some(ver_str) if !ver_str.is_empty() && ver_str != "latest" => {
                format!("{identity}@{ver_str}")
            }
            _ => identity.clone(),
        };
        return Ok((full, identity));
    }
    resolve_scope_target_id(scope_dir, raw_id, bare, explicit_ver)
}

fn resolve_scope_target_id(
    scope_dir: &Path,
    raw_id: &str,
    bare: &str,
    explicit_ver: Option<&str>,
) -> Result<(String, String), Failure> {
    let Some((scope_opt, comp_name, comp_hash)) = resolve_component_entry(scope_dir, bare) else {
        return resolve_missing_scope_target(raw_id, bare, explicit_ver);
    };
    let identity = scope_opt
        .as_deref()
        .filter(|scope| !scope.is_empty())
        .map_or_else(|| comp_name.clone(), |scope| format!("{scope}/{comp_name}"));
    let (_, comp_val) = bit_object_import::read_scope_object(scope_dir, &comp_hash)
        .ok()
        .flatten()
        .ok_or_else(|| Failure::Declined("missing Component object".into()))?;
    let ver = match explicit_ver {
        Some(ver_str) if !ver_str.is_empty() && ver_str != "latest" => Some(ver_str.to_owned()),
        _ => latest_version_label(&comp_val),
    };
    let full = ver.map_or_else(|| identity.clone(), |ver_str| format!("{identity}@{ver_str}"));
    Ok((full, identity))
}

fn resolve_missing_scope_target(
    raw_id: &str,
    bare: &str,
    explicit_ver: Option<&str>,
) -> Result<(String, String), Failure> {
    if raw_id.starts_with('@') || bare.is_empty() || explicit_ver == Some("") {
        return Err(Failure::Declined("component not found in workspace or scope".into()));
    }
    if !bare.contains('/') && !bare.contains('.') {
        return Err(Failure::User(format!(
            r#"error: component ID "{raw_id}" is invalid, please use the following format: [scope]/<name>"#,
        )));
    }
    if let Some((scope, name)) = bare.split_once('/') {
        selection::validate_scope_name(scope)?;
        selection::validate_component_name(name)?;
        let full = match explicit_ver {
            Some(ver_str) if ver_str != "latest" => format!("{bare}@{ver_str}"),
            _ => bare.to_owned(),
        };
        return Ok((full, bare.to_owned()));
    }
    Err(Failure::Declined("component not found in workspace or scope".into()))
}

fn latest_version_label(comp_val: &Value) -> Option<String> {
    let head = comp_val["head"].as_str()?;
    comp_val["versions"]
        .as_object()
        .and_then(|map| {
            map.iter()
                .find_map(|(tag, hash)| (hash.as_str() == Some(head)).then(|| tag.clone()))
        })
        .or_else(|| Some(head.to_owned()))
}

fn build_scope_graph(scope_dir: &Path) -> DepGraph {
    let mut graph = DepGraph::default();
    for row in active_index_rows(scope_dir) {
        add_scope_component_versions(scope_dir, &row, &mut graph);
    }
    graph
}

fn active_index_rows(scope_dir: &Path) -> Vec<Value> {
    let Ok(bytes) = fs::read(scope_dir.join("index.json")) else {
        return Vec::new();
    };
    let Ok(index) = serde_json::from_slice::<Value>(&bytes) else {
        return Vec::new();
    };
    index["components"]
        .as_array()
        .or_else(|| index.as_array())
        .map(|comps| {
            comps
                .iter()
                .filter(|row| row["isSymlink"] != true)
                .cloned()
                .collect()
        })
        .unwrap_or_default()
}

fn add_scope_component_versions(scope_dir: &Path, row: &Value, graph: &mut DepGraph) {
    let Some(comp_hash) = row["hash"].as_str() else { return };
    let Some((kind, comp_val)) =
        bit_object_import::read_scope_object(scope_dir, comp_hash).ok().flatten()
    else {
        return;
    };
    if kind != "Component" {
        return;
    }
    let Some(identity) = component_identity(&comp_val) else { return };
    for (ver_label, ver_hash) in collect_all_versions(&comp_val) {
        if let Some((v_kind, ver_val)) =
            bit_object_import::read_scope_object(scope_dir, &ver_hash).ok().flatten()
            && v_kind == "Version"
        {
            let node_id = format!("{identity}@{ver_label}");
            add_version_edges(graph, &node_id, &ver_val);
        }
    }
}

fn build_workspace_graph(scope_dir: &Path, ws: &Workspace) -> DepGraph {
    let mut graph = DepGraph::default();
    let ws_ids: HashMap<String, String> = ws
        .active()
        .map(|(entry, _)| (entry.id.to_string_without_version(), selection::entry_full_id(entry)))
        .collect();
    for row in active_index_rows(scope_dir) {
        add_latest_model_to_ws_graph(scope_dir, &row, &ws_ids, &mut graph);
    }
    for (entry, comp) in ws.active() {
        let node_id = selection::entry_full_id(entry);
        graph.add_node(node_id.clone());
        add_workspace_comp_edges(scope_dir, ws, comp, &node_id, &mut graph);
    }
    graph
}

fn add_latest_model_to_ws_graph(
    scope_dir: &Path,
    row: &Value,
    ws_ids: &HashMap<String, String>,
    graph: &mut DepGraph,
) {
    let Some(comp_hash) = row["hash"].as_str() else { return };
    let Some((kind, comp_val)) =
        bit_object_import::read_scope_object(scope_dir, comp_hash).ok().flatten()
    else {
        return;
    };
    if kind != "Component" {
        return;
    }
    let Some(identity) = component_identity(&comp_val) else { return };
    let Some(latest_ver) = latest_version_label(&comp_val) else { return };
    let node_id = format!("{identity}@{latest_ver}");
    if ws_ids.get(&identity) == Some(&node_id) {
        return;
    }
    if let Some(ver_val) = read_comp_version(scope_dir, &comp_val, &latest_ver) {
        add_version_edges(graph, &node_id, &ver_val);
    }
}

fn add_workspace_comp_edges(
    scope_dir: &Path,
    ws: &Workspace,
    comp: &WorkspaceComponent,
    node_id: &str,
    graph: &mut DepGraph,
) {
    if let Some(ver_val) = load_workspace_comp_version(scope_dir, comp) {
        add_version_edges(graph, node_id, &ver_val);
    }
    add_scanned_ws_edges(ws, comp, node_id, graph);
}

fn load_workspace_comp_version(scope_dir: &Path, comp: &WorkspaceComponent) -> Option<Value> {
    let ver = comp.id.version
        .as_deref()
        .filter(|ver| !ver.is_empty())?;
    let identity = comp.id.to_string_without_version();
    let (_, _, comp_hash) = resolve_component_entry(scope_dir, &identity)
        .or_else(|| resolve_component_entry(scope_dir, &comp.id.name))?;
    let (_, comp_val) = bit_object_import::read_scope_object(scope_dir, &comp_hash).ok()??;
    read_comp_version(scope_dir, &comp_val, ver)
}

fn read_comp_version(scope_dir: &Path, comp_val: &Value, ver: &str) -> Option<Value> {
    let ver_hash = resolve_ver_hash(comp_val, ver)?;
    let (v_kind, ver_val) = bit_object_import::read_scope_object(scope_dir, &ver_hash).ok()??;
    (v_kind == "Version").then_some(ver_val)
}

fn add_scanned_ws_edges(
    ws: &Workspace,
    comp: &WorkspaceComponent,
    node_id: &str,
    graph: &mut DepGraph,
) {
    for rel_file in &comp.files {
        let Ok(source) = fs::read_to_string(comp.dir.join(rel_file)) else { continue };
        let Ok(scanned) = bit_dependency_scanner::scan_source(rel_file.clone(), source) else {
            continue;
        };
        let Some(specifiers) = scanned["dependencies"].as_object() else { continue };
        for raw_spec in specifiers.keys() {
            if let Some(target_full_id) = match_ws_target(ws, &comp.id.name, raw_spec) {
                graph.add_edge(node_id.to_owned(), target_full_id, "prod");
            }
        }
    }
}

fn match_ws_target(ws: &Workspace, self_name: &str, raw_spec: &str) -> Option<String> {
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

fn component_identity(comp_val: &Value) -> Option<String> {
    let name = comp_val["name"].as_str()?;
    match comp_val["scope"]
        .as_str()
        .filter(|scope| !scope.is_empty())
    {
        Some(scope) => Some(format!("{scope}/{name}")),
        None => Some(name.to_owned()),
    }
}

fn collect_all_versions(comp_val: &Value) -> Vec<(String, String)> {
    let mut versions = Vec::new();
    for field in ["versions", "orphanedVersions"] {
        let Some(map) = comp_val[field].as_object() else { continue };
        for (ver, hash_val) in map {
            if let Some(hash) = hash_val.as_str() {
                versions.push((ver.clone(), hash.to_owned()));
            }
        }
    }
    versions
}

fn resolve_ver_hash(comp_val: &Value, ver: &str) -> Option<String> {
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

pub(super) fn add_version_edges(graph: &mut DepGraph, node_id: &str, ver_val: &Value) {
    graph.add_node(node_id.to_owned());
    let groups =
        [("dependencies", "prod"), ("devDependencies", "dev"), ("peerDependencies", "prod")];
    for (field, dep_type) in groups {
        let Some(arr) = ver_val[field].as_array() else { continue };
        for item in arr {
            if let Some(dep_id) = format_dep_id(&item["id"]) {
                graph.add_edge(node_id.to_owned(), dep_id, dep_type);
            }
        }
    }
}

fn format_dep_id(id_val: &Value) -> Option<String> {
    let name = id_val["name"].as_str()?;
    let ver = id_val["version"].as_str().unwrap_or_default();
    let base = match id_val["scope"]
        .as_str()
        .filter(|scope| !scope.is_empty())
    {
        Some(scope) => format!("{scope}/{name}"),
        None => name.to_owned(),
    };
    Some(if ver.is_empty() { base } else { format!("{base}@{ver}") })
}
