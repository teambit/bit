//! `--restore`: `resolveDependenciesGraph` and
//! `getDependenciesGraphByComponentIds` (`components/legacy/scope/scope.ts`) —
//! the stored dependency graphs of the workspace components, merged into one.

mod graph;
mod peers;
#[cfg(test)]
mod tests;

use super::{calculate::Calculated, session::Session};
use crate::{engine::RestoreInput, options::InstallOptions, output::Style, policy::scope::Scope};
use serde_json::Value;
use std::io;

/// `DEPENDENCIES_GRAPH_SCHEMA_VERSION`.
const SCHEMA_VERSION: &str = "2.0";
const NEEDS_ROOT_COMPONENTS: &str = r#"--restore requires "rootComponents: true" in the dependency-resolver config; falling back to a regular install."#;
const NO_GRAPH: &str = "--restore was requested but no workspace component has a stored dependency graph. Falling back to a regular install.";

/// The graph to restore the lockfile from, or `None` (with the canonical warning)
/// for a regular install. A graph the caller passed (`dependenciesGraph`) comes first,
/// as in `resolveDependenciesGraph`.
pub fn input(
    session: &Session<'_>,
    has_root_components: bool,
    calculated: &Calculated,
) -> io::Result<Option<RestoreInput>> {
    if let Some(graph) = explicit(session.options) {
        return Ok(Some(graph));
    }
    if !session.options.restore {
        return Ok(None);
    }
    if !has_root_components {
        warn(session, NEEDS_ROOT_COMPONENTS);
        return Ok(None);
    }
    let Some(scope) = Scope::find(&session.root) else {
        warn(session, NO_GRAPH);
        return Ok(None);
    };
    let mut merged: Option<Value> = None;
    for component in &calculated.components {
        let id = component.id.to_string_without_version();
        let Some(stored) = stored_graph(&scope, &id, component.id.version.as_deref())? else {
            continue;
        };
        merged = Some(match merged {
            None => stored,
            Some(mut graph) => {
                graph::merge(&mut graph, &stored);
                graph
            }
        });
    }
    let Some(graph) = merged else {
        warn(session, NO_GRAPH);
        return Ok(None);
    };
    Ok(Some(RestoreInput { graph, fail_on_error: true }))
}

/// `options.dependenciesGraph` (`bit import` writing components passes the merged
/// graphs of the imported components). The engine restores it like the stored graphs,
/// only with root components (`dependenciesGraphToLockfile`), and a failure fails the
/// install only with `restoreFromDependenciesGraph` (`failOnDependenciesGraphError`).
fn explicit(options: &InstallOptions) -> Option<RestoreInput> {
    let graph = options.dependencies_graph.clone()?;
    Some(RestoreInput { graph, fail_on_error: options.restore })
}

/// `formatWarningSummary`.
fn warn(session: &Session<'_>, message: &str) {
    let output = &session.output;
    let symbol = output.paint(Style::Yellow, "\u{26A0}");
    output.console(&format!("{symbol} {}", output.paint(Style::Yellow, message)));
}

/// `getDependenciesGraphByComponentIds` with the feature toggle on: the stored
/// graphs of `ids` (`<scope>/<name>`, version) merged into one, or `None` when
/// none of them has one. `bit import` passes it as `dependenciesGraph`.
pub fn stored_graphs(
    root: &std::path::Path,
    ids: &[(String, String)],
) -> io::Result<Option<Value>> {
    let Some(scope) = Scope::find(root) else { return Ok(None) };
    let mut merged: Option<Value> = None;
    for (id, version) in ids {
        let Some(stored) = stored_graph(&scope, id, Some(version))? else { continue };
        match &mut merged {
            None => merged = Some(stored),
            Some(graph) => graph::merge(graph, &stored),
        }
    }
    Ok(merged)
}

/// `getDependenciesGraphByComponentId`: the Version's `dependenciesGraphRef` Source,
/// when its schema is supported and it is not empty.
fn stored_graph(scope: &Scope, id: &str, version: Option<&str>) -> io::Result<Option<Value>> {
    let Ok(Some(object)) = scope.version(id, version) else { return Ok(None) };
    let Some(reference) = object.get("dependenciesGraphRef").and_then(Value::as_str) else {
        return Ok(None);
    };
    let Some(bytes) = scope.object(reference, "Source")? else { return Ok(None) };
    let Ok(text) = std::str::from_utf8(&bytes) else { return Ok(None) };
    let Ok(graph) = crate::jsonc::parse(text) else { return Ok(None) };
    if graph["schemaVersion"] != SCHEMA_VERSION || graph::is_empty(&graph) {
        return Ok(None);
    }
    Ok(Some(graph))
}
