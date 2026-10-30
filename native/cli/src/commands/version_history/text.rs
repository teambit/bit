//! Render the bounded linear history without loading the JavaScript runtime.
use super::{
    Chalk, Outcome, ScopeRoot, Value, diagnose_component_lookup_error, emit_failure, emit_text,
    resolve_component_entry, scope_dir_for, sha1_hex,
};
use std::{env, ffi::OsString, io};
mod graph;
mod refs;

pub(super) fn run(
    root: &ScopeRoot,
    args: &[OsString],
    id: &str,
    short: bool,
) -> io::Result<Outcome> {
    let chalk = Chalk::detect(args);
    let Some(report) = prepare(root, id, short, chalk) else {
        let scope_dir = scope_dir_for(root);
        let bare = id.rsplit_once('@').map_or(id, |(name, _)| name);
        if bare.contains('/')
            && resolve_component_entry(&scope_dir, bare).is_none()
            && env::var_os("CI").is_none_or(|val| val.is_empty())
            && let Some(err) = diagnose_component_lookup_error(&scope_dir, id, bare, chalk)
        {
            return emit_failure(root, args, "show", true, false, err);
        }
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
        output.push(format_row(model, &graph, node, short, chalk, lanes));
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
) -> String {
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
    if let Some(tag) = tags(model, hash) {
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
    format!("{}{pointer} {edge}", chalk.bold(label))
}

fn pointer_text(pointers: &[&str], chalk: Chalk) -> String {
    if pointers.is_empty() {
        String::new()
    } else {
        format!(" ({})", chalk.cyan(&pointers.join(", ")))
    }
}

pub(in crate::commands) fn tags<'a>(model: &'a Value, hash: &str) -> Option<&'a str> {
    for key in ["versions", "orphanedVersions"] {
        let Some(map) = model.get(key).and_then(Value::as_object) else {
            continue;
        };
        if let Some((tag, _)) = map
            .iter()
            .rev()
            .find(|(_, value)| value.as_str() == Some(hash))
        {
            return Some(tag.as_str());
        }
    }
    None
}

#[cfg(test)]
mod tests;
