use super::super::{graph, selection};
use crate::workspace::engine::command::{invalid, repository::Repository};
use serde_json::{Value, json};
use std::io;

// Canonical scope graph discovery reuses persisted edges. Direct metadata may
// substitute only when its ordered root adjacency is equivalent.
pub(super) fn validate(
    entry: &crate::command_import::lane::Entry,
    version: &Value,
    repository: &mut Repository,
) -> io::Result<()> {
    let saved = match version["flattenedEdgesRef"].as_str() {
        Some(reference) => repository.source_json(reference)?,
        None => version
            .get("flattenedEdges")
            .cloned()
            .unwrap_or_else(|| json!([])),
    };
    equivalent(&entry.identity, &entry.head, version, &saved)
}

fn equivalent(identity: &str, head: &str, version: &Value, saved: &Value) -> io::Result<()> {
    let rows = saved.as_array().ok_or_else(|| invalid("hidden saved graph"))?;
    if rows.len() > 16384 {
        return Err(invalid("hidden saved graph budget"));
    }
    // Older Versions without saved edges use canonical direct graph loading.
    if rows.is_empty()
        && version["flattenedDependencies"]
            .as_array()
            .is_some_and(|ids| !ids.is_empty())
    {
        return Ok(());
    }
    let (scope, name) = identity.split_once('/').ok_or_else(|| invalid("hidden graph identity"))?;
    let root = json!({"scope":scope,"name":name,"version":head});
    let expected = graph::edges(&root, version)?;
    if outgoing(rows, identity, head, &root)? != expected {
        return Err(invalid("hidden saved graph differs from direct metadata"));
    }
    Ok(())
}

fn outgoing(rows: &[Value], identity: &str, head: &str, root: &Value) -> io::Result<Vec<Value>> {
    let mut actual = Vec::<Value>::new();
    for row in rows {
        if selection::identity(&row["source"])? != identity {
            continue;
        }
        if row["source"]["version"] != head {
            return Err(invalid("hidden saved graph root version"));
        }
        let mut edge = row.clone();
        edge["source"] = root.clone();
        if let Some(previous) = actual
            .iter_mut()
            .find(|old| old["target"] == edge["target"])
        {
            *previous = edge;
        } else {
            actual.push(edge);
        }
    }
    Ok(actual)
}

#[cfg(test)]
mod tests;
