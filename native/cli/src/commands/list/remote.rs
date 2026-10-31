//! Scalar remote inventory and latest-version facts, without importing repository objects.

use super::{Options, Row, WorkspaceRow, decline};
use crate::commands::{
    engine::Engine, remote_resolution::Session, status::cache::cache_root,
    workspace_command::NodeCli,
};
use serde_json::{Value, json};
use std::{
    fs::File,
    io::{self, Read},
    path::Path,
};

fn request(root: Option<&Path>, mode: &str) -> io::Result<Value> {
    let cli = NodeCli::find()?;
    Ok(json!({
        "kind":"commandRemoteInventory", "root":root, "mode":mode,
        "globalConfigDir":cache_root().join("config"),
        "nodeExecutable":cli.node, "bitDir":cli.bit_dir, "bitVersion":cli.version,
    }))
}

pub(super) fn list(
    root: Option<&Path>,
    options: &Options,
    session: &mut Session,
) -> io::Result<Vec<Row>> {
    let mut query = request(root, "list")?;
    let scope = options.remote.as_ref().ok_or_else(|| decline("remote list scope"))?;
    session.resolve(std::slice::from_ref(scope))?;
    query["scope"] = json!(options.remote);
    query["namespaces"] = json!(
        options.namespace
            .as_ref()
            .map(|text| { if text.contains('*') { text.clone() } else { format!("{text}/**") } })
    );
    query["includeDeleted"] = json!(options.include_deleted);
    query["hosts"] = json!(session.overrides());
    let result: Value = Engine::new()?.request(&query)?;
    if result["oldServerWarning"] == true {
        session.add_warning("error: the remote does not support the include-deleted flag yet, falling back to listing without deleted components");
    }
    result["components"]
        .as_array()
        .ok_or_else(|| decline("remote list rows"))?
        .iter()
        .map(row)
        .collect()
}

fn parse_row_id(value: &Value) -> io::Result<(String, Option<String>)> {
    let id = value["id"]
        .as_str()
        .map(str::trim)
        .ok_or_else(|| decline("remote list component id"))?;
    let (identity, version) = id
        .rsplit_once('@')
        .map_or((id, None), |(id, version)| (id.trim(), Some(version.trim().to_string())));
    if !identity
        .split_once('/')
        .is_some_and(|(scope, name)| !scope.trim().is_empty() && !name.trim().is_empty())
        || version.as_ref().is_some_and(String::is_empty)
    {
        return Err(decline("remote list identity"));
    }
    Ok((identity.to_string(), version))
}

fn row(value: &Value) -> io::Result<Row> {
    let (identity, version) = parse_row_id(value)?;
    let boolean = |field| match value.get(field) {
        None | Some(Value::Null) => Ok(None),
        Some(Value::Bool(flag)) => Ok(Some(*flag)),
        _ => Err(decline("remote list metadata")),
    };
    let lane_readme_of = match value.get("laneReadmeOf") {
        None | Some(Value::Null) => Vec::new(),
        Some(Value::Array(lanes)) => lanes
            .iter()
            .map(|lane| {
                lane.as_str()
                    .map(str::trim)
                    .map(str::to_string)
                    .ok_or_else(|| decline("remote list readme"))
            })
            .collect::<io::Result<_>>()?,
        _ => return Err(decline("remote list readme")),
    };
    Ok(Row {
        identity,
        workspace: WorkspaceRow { has_scope: true, used: None, root_dir: None },
        version,
        deprecated: boolean("deprecated")?,
        removed: boolean("removed")?,
        remote_version: None,
        lane_readme_of,
    })
}

/// `ComponentsList.listAll` requests versions before scope and lane visibility filters.
pub(super) fn versions(root: &Path, rows: &mut [Row], session: &mut Session) -> io::Result<()> {
    let mut bytes = Vec::new();
    File::open(bit_object_import::scope_path(root).join("scope.json"))?
        .take(1024 * 1024 + 1)
        .read_to_end(&mut bytes)?;
    if bytes.len() > 1024 * 1024 {
        return Err(decline("local scope configuration budget"));
    }
    let config: Value = bit_object_import::parse_jsonc(&bytes)?;
    let local = config["name"]
        .as_str()
        .map(str::trim)
        .filter(|name| !name.is_empty())
        .ok_or_else(|| decline("local scope name"))?;
    let ids = rows
        .iter()
        .filter(|row| {
            row.workspace.has_scope
                && row.identity
                    .split_once('/')
                    .is_some_and(|(scope, _)| scope.trim() != local)
        })
        .map(Row::id)
        .collect::<Vec<_>>();
    if ids.is_empty() {
        return Ok(());
    }
    let mut query = request(Some(root), "latestVersions")?;
    session.resolve(&remote_scopes(&ids)?)?;
    query["ids"] = json!(ids);
    query["hosts"] = json!(session.overrides());
    let result: Value = Engine::new()?.request(&query)?;
    apply_latest_versions(
        rows,
        result["ids"].as_array().ok_or_else(|| decline("remote latest versions"))?,
    )
}

fn apply_latest_versions(rows: &mut [Row], values: &[Value]) -> io::Result<()> {
    for value in values {
        let id = value
            .as_str()
            .map(str::trim)
            .ok_or_else(|| decline("remote version id"))?;
        let (identity, version) = id
            .rsplit_once('@')
            .map(|(identity, version)| (identity.trim(), version.trim()))
            .ok_or_else(|| decline("remote version"))?;
        let row = rows
            .iter_mut()
            .find(|row| row.identity == identity)
            .ok_or_else(|| decline("unexpected remote version"))?;
        if version.is_empty() || row.remote_version.is_some() {
            return Err(decline("duplicate remote version"));
        }
        row.remote_version = Some(version.to_string());
    }
    Ok(())
}

fn remote_scopes(ids: &[String]) -> io::Result<Vec<String>> {
    let mut scopes = Vec::new();
    for id in ids {
        let scope = id
            .split_once('/')
            .map(|(scope, _)| scope.trim())
            .filter(|scope| !scope.is_empty())
            .ok_or_else(|| decline("remote version scope"))?;
        if !scopes.iter().any(|seen| seen == scope) {
            scopes.push(scope.to_owned());
        }
    }
    Ok(scopes)
}
