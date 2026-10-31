//! Bare-scope component dependency graph builder for `bit graph`.

use super::{
    Options,
    builder::{format_dep_id, resolve_ver_hash},
    model::{CompGraph, write_svg_file},
};
use crate::commands::{
    debug_cat::lookup::resolve_component_entry, remote_action::startup, scope_set::Failure,
    version_history::text::tags, workspace_command::format::Formatter,
};
use serde_json::{Value, json};
use std::{fs, path::Path};

pub(super) fn execute_scope_graph(
    scope_dir: &Path,
    options: &Options,
    formatter: &Formatter,
) -> Result<String, Failure> {
    let graph = build_scope_graph(scope_dir, options)?;
    render_scope_graph(&graph, options.json, formatter)
}

pub(crate) fn scope_insight_graph(scope_dir: &Path) -> Result<(CompGraph, Vec<String>), Failure> {
    let scope_name = validate_bare_scope(scope_dir)?;
    let local_components = load_local_scope_components(scope_dir, &scope_name)?;
    let local_ids: Vec<String> = local_components
        .iter()
        .map(|(id, _)| id.clone())
        .collect();
    let mut graph = CompGraph::default();
    for (node_id, ver_val) in &local_components {
        populate_saved_version_graph(scope_dir, node_id, ver_val, &mut graph)?;
    }
    graph.sort_deterministic();
    Ok((graph, local_ids))
}

fn build_scope_graph(scope_dir: &Path, options: &Options) -> Result<CompGraph, Failure> {
    let scope_name = validate_bare_scope(scope_dir)?;
    let local_components = load_local_scope_components(scope_dir, &scope_name)?;
    let local_ids: Vec<String> = local_components
        .iter()
        .map(|(id, _)| id.clone())
        .collect();
    let targets = if let Some(ref raw_id) = options.id {
        vec![resolve_scope_seeder(scope_dir, raw_id)?]
    } else {
        local_components
    };
    let mut graph = CompGraph::default();
    for (node_id, ver_val) in &targets {
        populate_saved_version_graph(scope_dir, node_id, ver_val, &mut graph)?;
    }
    apply_scope_filters(&mut graph, options, &local_ids)?;
    graph.sort_deterministic();
    Ok(graph)
}

fn apply_scope_filters(
    graph: &mut CompGraph,
    options: &Options,
    local_ids: &[String],
) -> Result<(), Failure> {
    if !options.include_dependencies {
        if options.json
            && !local_ids
                .iter()
                .all(|id| graph.nodes.contains(id))
        {
            return Err(Failure::Declined(
                "local-only json graph seeder excludes local component".into(),
            ));
        }
        graph.filter_local_only(local_ids);
    }
    if options.cycles && !options.json {
        graph.filter_cycles();
    }
    Ok(())
}

fn render_scope_graph(
    graph: &CompGraph,
    json_out: bool,
    formatter: &Formatter,
) -> Result<String, Failure> {
    if json_out {
        let payload = json!({
            "nodes": graph.nodes,
            "edges": graph.edges,
        });
        return serde_json::to_string_pretty(&payload)
            .map_err(|err| Failure::Declined(err.to_string()));
    }
    let svg_path = write_svg_file(graph)?;
    Ok(formatter.success_summary(&format!("image created at {}", svg_path.display())))
}

fn validate_bare_scope(scope_dir: &Path) -> Result<String, Failure> {
    if startup::supported(None, scope_dir, &Value::Null, true).ok() != Some(true) {
        return Err(Failure::Declined("bare scope requires unsupported startup".into()));
    }
    let bytes =
        fs::read(scope_dir.join("scope.json")).map_err(|err| Failure::Declined(err.to_string()))?;
    let val =
        bit_object_import::parse_jsonc(&bytes).map_err(|err| Failure::Declined(err.to_string()))?;
    val["name"]
        .as_str()
        .map(str::trim)
        .filter(|name| !name.is_empty())
        .map(str::to_owned)
        .ok_or_else(|| Failure::Declined("missing scope name".into()))
}

fn load_local_scope_components(
    scope_dir: &Path,
    scope_name: &str,
) -> Result<Vec<(String, Value)>, Failure> {
    let bytes = match fs::read(scope_dir.join("index.json")) {
        Ok(bytes) => bytes,
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(err) => return Err(Failure::Declined(err.to_string())),
    };
    let index =
        bit_object_import::parse_jsonc(&bytes).map_err(|err| Failure::Declined(err.to_string()))?;
    let rows = index["components"]
        .as_array()
        .or_else(|| index.as_array())
        .ok_or_else(|| Failure::Declined("invalid index.json components".into()))?;
    if rows.len() > 128 {
        return Err(Failure::Declined("bare scope component count exceeds native cap".into()));
    }
    let mut list = Vec::new();
    for row in rows
        .iter()
        .filter(|row| row["isSymlink"] != true)
    {
        let (row_scope, row_name) = index_row_scope_and_name(row);
        if row_scope != Some(scope_name) {
            continue;
        }
        if let Some(entry) = load_index_row_version(scope_dir, scope_name, row, row_name)? {
            list.push(entry);
        }
    }
    Ok(list)
}

fn index_row_scope_and_name(row: &Value) -> (Option<&str>, Option<&str>) {
    if let Some(id_str) = row["id"].as_str() {
        let bare = id_str
            .split('@')
            .next()
            .unwrap_or(id_str);
        return match bare.split_once('/') {
            Some((sc, nm)) => (Some(sc), Some(nm)),
            None => (None, Some(bare)),
        };
    }
    (row["id"]["scope"].as_str(), row["id"]["name"].as_str())
}

fn load_index_row_version(
    scope_dir: &Path,
    scope_name: &str,
    row: &Value,
    row_name: Option<&str>,
) -> Result<Option<(String, Value)>, Failure> {
    let name = row_name
        .filter(|name| !name.is_empty())
        .ok_or_else(|| Failure::Declined("missing component name".into()))?;
    let hash =
        row["hash"].as_str().ok_or_else(|| Failure::Declined("missing component hash".into()))?;
    let (kind, comp_val) = bit_object_import::read_scope_object(scope_dir, hash)
        .ok()
        .flatten()
        .ok_or_else(|| Failure::Declined("missing Component object".into()))?;
    if kind != "Component" {
        return Err(Failure::Declined("unexpected non-Component in index".into()));
    }
    let Some(head) = comp_val["head"].as_str() else {
        return Ok(None);
    };
    let ver_val = read_version_object(scope_dir, head)?;
    if is_version_removed(&ver_val) {
        return Err(Failure::Declined("removed component in bare scope".into()));
    }
    let ver_label = tags(&comp_val, head).unwrap_or(head);
    Ok(Some((format!("{scope_name}/{name}@{ver_label}"), ver_val)))
}

fn resolve_scope_seeder(scope_dir: &Path, raw_id: &str) -> Result<(String, Value), Failure> {
    let raw_id = raw_id.trim();
    let (bare, explicit_ver) = raw_id
        .rsplit_once('@')
        .map_or((raw_id, None), |(id, ver)| (id.trim(), Some(ver.trim())));
    if bare.is_empty() || explicit_ver == Some("") {
        return Err(Failure::Declined("invalid graph target id".into()));
    }
    let (Some(scope), name, comp_hash) = resolve_component_entry(scope_dir, bare)
        .ok_or_else(|| Failure::Declined("graph target id not found in scope".into()))?
    else {
        return Err(Failure::Declined("graph target missing scope".into()));
    };
    let (kind, comp_val) = bit_object_import::read_scope_object(scope_dir, &comp_hash)
        .ok()
        .flatten()
        .ok_or_else(|| Failure::Declined("missing target Component object".into()))?;
    if kind != "Component" {
        return Err(Failure::Declined("unexpected target object kind".into()));
    }
    let ver_hash = resolve_ver_hash(&comp_val, explicit_ver.unwrap_or("latest"))
        .ok_or_else(|| Failure::Declined("target version not found".into()))?;
    Ok((
        format!("{scope}/{name}@{}", tags(&comp_val, &ver_hash).unwrap_or(&ver_hash)),
        read_version_object(scope_dir, &ver_hash)?,
    ))
}

fn read_version_object(scope_dir: &Path, ver_hash: &str) -> Result<Value, Failure> {
    let (kind, ver_val) = bit_object_import::read_scope_object(scope_dir, ver_hash)
        .ok()
        .flatten()
        .ok_or_else(|| Failure::Declined("missing Version object".into()))?;
    if kind != "Version" {
        return Err(Failure::Declined("unexpected non-Version object".into()));
    }
    Ok(ver_val)
}

fn is_version_removed(ver_val: &Value) -> bool {
    ver_val["extensions"]
        .as_array()
        .is_some_and(|exts| {
            exts.iter()
                .any(|ext| {
                    crate::commands::update_cmd::matches_aspect(ext, "teambit.component/remove")
                        && ext["config"]["removed"] == true
                })
        })
}

fn populate_saved_version_graph(
    scope_dir: &Path,
    node_id: &str,
    ver_val: &Value,
    graph: &mut CompGraph,
) -> Result<(), Failure> {
    let flattened_deps = read_flattened_dependencies(scope_dir, ver_val)?;
    let flattened_edges = read_flattened_edges(scope_dir, ver_val)?;
    if flattened_edges.is_empty() && !flattened_deps.is_empty() {
        return Err(Failure::Declined("missing saved flattenedEdges".into()));
    }
    graph.add_node(node_id.to_owned());
    for dep in flattened_deps {
        graph.add_node(dep);
    }
    for (src, dst, attr) in flattened_edges {
        graph.add_edge(src, dst, &attr);
    }
    Ok(())
}

fn read_flattened_dependencies(scope_dir: &Path, ver_val: &Value) -> Result<Vec<String>, Failure> {
    if let Some(ref_hash) = ver_val["flattenedDependenciesRef"].as_str() {
        let (_, body) = bit_object_import::read_raw_scope_object(scope_dir, ref_hash)
            .ok()
            .flatten()
            .ok_or_else(|| Failure::Declined("missing flattenedDependenciesRef object".into()))?;
        let Value::Array(items) = bit_object_import::parse_jsonc(&body)
            .map_err(|err| Failure::Declined(err.to_string()))?
        else {
            return Err(Failure::Declined("invalid flattenedDependenciesRef array".into()));
        };
        return items
            .iter()
            .map(parse_dep_item)
            .collect::<Option<Vec<_>>>()
            .ok_or_else(|| Failure::Declined("invalid flattenedDependenciesRef entry".into()));
    }
    let mut deps = Vec::new();
    for key in ["flattenedDependencies", "flattenedDevDependencies"] {
        let Some(items) = ver_val[key].as_array() else { continue };
        for item in items {
            deps.push(
                parse_dep_item(item)
                    .ok_or_else(|| Failure::Declined("invalid flattenedDependency".into()))?,
            );
        }
    }
    Ok(deps)
}

fn read_flattened_edges(
    scope_dir: &Path,
    ver_val: &Value,
) -> Result<Vec<(String, String, String)>, Failure> {
    if let Some(ref_hash) = ver_val["flattenedEdgesRef"].as_str() {
        let (_, body) = bit_object_import::read_raw_scope_object(scope_dir, ref_hash)
            .ok()
            .flatten()
            .ok_or_else(|| Failure::Declined("missing flattenedEdgesRef object".into()))?;
        let Value::Array(items) = bit_object_import::parse_jsonc(&body)
            .map_err(|err| Failure::Declined(err.to_string()))?
        else {
            return Err(Failure::Declined("invalid flattenedEdgesRef array".into()));
        };
        return items
            .iter()
            .map(parse_edge_item)
            .collect::<Option<Vec<_>>>()
            .ok_or_else(|| Failure::Declined("invalid flattenedEdgesRef entry".into()));
    }
    let Some(items) = ver_val["flattenedEdges"].as_array() else {
        return Ok(Vec::new());
    };
    items
        .iter()
        .map(parse_edge_item)
        .collect::<Option<Vec<_>>>()
        .ok_or_else(|| Failure::Declined("invalid flattenedEdge entry".into()))
}

fn parse_dep_item(item: &Value) -> Option<String> {
    item.as_str()
        .filter(|text| !text.is_empty())
        .map(str::to_owned)
        .or_else(|| format_dep_id(item))
}

fn parse_edge_item(item: &Value) -> Option<(String, String, String)> {
    if let Some(arr) = item.as_array() {
        let [src, dst, edge_type] = arr.as_slice() else { return None };
        return Some((parse_dep_item(src)?, parse_dep_item(dst)?, edge_type.as_str()?.to_owned()));
    }
    Some((
        parse_dep_item(&item["source"])?,
        parse_dep_item(&item["target"])?,
        item["type"].as_str()?.to_owned(),
    ))
}
