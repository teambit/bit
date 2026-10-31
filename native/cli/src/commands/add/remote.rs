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
    let rendered = ids
        .iter()
        .filter_map(remote_id_str)
        .collect::<Vec<_>>();
    let Some(example) = rendered.first() else {
        return;
    };
    let name = example.split_once('/').map_or(example.as_str(), |(_, name)| name);
    let formatter = Formatter::new(chalk);
    let rows = rendered
        .iter()
        .map(|id| formatter.item(id))
        .collect::<Vec<_>>()
        .join("\n");
    let text = format!(
        "the following newly added component(s) already exist on the remote scope with the same id:\n{rows}\nif you meant to work on the existing component, remove your local one and run \"bit import {example}\".\nif this is a new, unrelated component, rename yours to avoid the clash, e.g. \"bit rename {name} <new-name>\" (or \"bit rename {name} {name} --scope <other-scope>\" to change only the scope).",
    );
    output.warning(&text);
}

fn remote_id_str(value: &Value) -> Option<String> {
    if let Some(id) = value
        .as_str()
        .or_else(|| value["id"].as_str())
        .or_else(|| value["identity"].as_str())
        .filter(|id| !id.is_empty())
    {
        return Some(id.to_owned());
    }
    let name = value["name"]
        .as_str()
        .or_else(|| value["id"]["name"].as_str())
        .filter(|name| !name.is_empty())?;
    Some(
        value["scope"]
            .as_str()
            .or_else(|| value["id"]["scope"].as_str())
            .filter(|scope| !scope.is_empty())
            .map_or_else(|| name.to_owned(), |scope| format!("{scope}/{name}")),
    )
}

fn candidates(added: &[Value], projection: &Projection) -> Vec<Value> {
    added
        .iter()
        .filter_map(|row| {
            let identity = row["identity"]
                .as_str()
                .or_else(|| row["id"].as_str())
                .map(|id| id.rsplit_once('@').map_or(id, |(base, _)| base))?;
            projection.workspace.components
                .iter()
                .any(|component| {
                    component.id.scope.is_none()
                        && identity == component.id.to_string_without_version()
                })
                .then(|| Value::String(identity.to_owned()))
        })
        .collect()
}
