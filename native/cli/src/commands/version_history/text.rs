//! Render the bounded linear history without loading the JavaScript runtime.
use super::{
    Chalk, Outcome, ScopeRoot, Value, emit_text, resolve_component_entry, scope_dir_for, sha1_hex,
};
use std::{ffi::OsString, io};
mod graph;
mod refs;

pub(super) fn run(
    root: &ScopeRoot,
    args: &[OsString],
    id: &str,
    short: bool,
) -> io::Result<Outcome> {
    let Some(report) = prepare(root, id, short, Chalk::detect(args)) else {
        return Ok(Outcome::Declined(
            "version-history text requires a qualified local graph".into(),
        ));
    };
    emit_text(root, args, "show", true, report)
}

fn prepare(root: &ScopeRoot, id: &str, short: bool, chalk: Chalk) -> Option<String> {
    let scope_dir = scope_dir_for(root);
    let bare = id.rsplit_once('@').map_or(id, |(name, _)| name);
    let (scope, name, model_hash) = resolve_component_entry(&scope_dir, bare)?;
    let scope = scope?;
    let lanes = refs::lanes(&scope_dir, &scope, &name)?;
    let (kind, model) = bit_object_import::read_scope_object(&scope_dir, &model_hash).ok()??;
    if kind != "Component" {
        return None;
    }
    let history_hash = sha1_hex(&format!("{scope}/{name}:VersionHistory"));
    let history = match bit_object_import::read_scope_object(&scope_dir, &history_hash).ok()? {
        Some((kind, value)) if kind == "VersionHistory" => value,
        None => return Some(String::new()),
        _ => return None,
    };
    render(&history, &model, short, chalk, &lanes)
}

fn render(
    history: &Value,
    model: &Value,
    short: bool,
    chalk: Chalk,
    lanes: &[(String, String)],
) -> Option<String> {
    let graph = graph::Graph::build(history, short)?;
    let mut output = Vec::new();
    for index in graph.order()? {
        let node = &graph.nodes[index];
        output.push(format_row(model, &graph, node, short, chalk, lanes)?);
    }
    Some(output.join("\n"))
}

fn format_row(
    model: &Value,
    graph: &graph::Graph,
    node: &graph::Node,
    short: bool,
    chalk: Chalk,
    lanes: &[(String, String)],
) -> Option<String> {
    let hash = node.hash.as_str();
    let mut pointers = Vec::new();
    pointers.extend(
        lanes
            .iter()
            .filter(|(_, head)| head == hash)
            .map(|(name, _)| name.as_str()),
    );
    if model["head"].as_str() == Some(hash) {
        pointers.push("main");
    }
    if let Some(tag) = tags(model, hash)? {
        pointers.push(tag);
    }
    let pointer = pointer_text(&pointers, chalk);
    let label = if short { &hash[..9] } else { hash };
    let edge = node.edges
        .iter()
        .map(|(target, kind)| {
            let hash = &graph.nodes[*target].hash;
            format!("{} ({kind})", if short { &hash[..9] } else { hash })
        })
        .collect::<Vec<_>>()
        .join(", ");
    Some(format!("{}{pointer} {edge}", chalk.bold(label)))
}

fn pointer_text(pointers: &[&str], chalk: Chalk) -> String {
    if pointers.is_empty() {
        String::new()
    } else {
        format!(" ({})", chalk.cyan(&pointers.join(", ")))
    }
}

fn tags<'a>(model: &'a Value, hash: &str) -> Option<Option<&'a str>> {
    let mut found = None;
    for key in ["versions", "orphanedVersions"] {
        let Some(map) = model.get(key).and_then(Value::as_object) else { continue };
        for (tag, _) in map
            .iter()
            .filter(|(_, value)| value.as_str() == Some(hash))
        {
            if found.is_some() {
                return None;
            }
            found = Some(tag.as_str());
        }
    }
    Some(found)
}

#[cfg(test)]
mod tests;
