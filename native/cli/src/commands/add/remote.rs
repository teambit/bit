//! Best-effort collision facts after the tracked bitmap is persisted.
use super::projection::Projection;
use crate::{
    commands::{color::Chalk, workspace_command::format::Formatter},
    host::Host,
};
use serde_json::{Value, json};
pub(super) fn warn(
    host: &Host,
    added: &[Value],
    projection: &Projection,
    chalk: Chalk,
    output: &bit_install::output::Output,
) {
    let ids = candidates(added, projection);
    if ids.is_empty() {
        return;
    }
    let Ok(ids) = host.call("trackingRemoteExistence", &json!({"ids":ids})) else {
        return;
    };
    let Some(ids) = ids
        .as_array()
        .filter(|ids| !ids.is_empty())
    else {
        return;
    };
    let Some(example) = ids[0].as_str() else {
        return;
    };
    let name = example.split_once('/').map_or(example, |(_, name)| name);
    let formatter = Formatter::new(chalk);
    let rows = ids
        .iter()
        .filter_map(Value::as_str)
        .map(|id| formatter.item(id))
        .collect::<Vec<_>>()
        .join("\n");
    let text = format!(
        "the following newly added component(s) already exist on the remote scope with the same id:\n{rows}\nif you meant to work on the existing component, remove your local one and run \"bit import {example}\".\nif this is a new, unrelated component, rename yours to avoid the clash, e.g. \"bit rename {name} <new-name>\" (or \"bit rename {name} {name} --scope <other-scope>\" to change only the scope).",
    );
    output.warning(&text);
}

fn candidates(added: &[Value], projection: &Projection) -> Vec<Value> {
    added
        .iter()
        .filter(|row| {
            projection.workspace.components
                .iter()
                .any(|component| {
                    component.id.scope.is_none()
                        && row["identity"] == component.id.to_string_without_version()
                })
        })
        .map(|row| row["identity"].clone())
        .collect()
}
