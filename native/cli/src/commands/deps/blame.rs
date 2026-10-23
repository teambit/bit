//! Local history for `bit deps blame <component> <dependency>`.

use super::resolve::{Identity, ResolvedDep, WorkspaceDepsContext};
use crate::{
    commands::{
        color::Chalk,
        engine::Engine,
        log,
        scope_set::Failure,
        workspace_command::{self, format::Formatter, results::Report},
    },
    native::Outcome,
};
use bit_install::model::{ComponentId, WorkspaceComponent};
use serde_json::{Value, json};
use std::{ffi::OsString, io, path::Path};

struct BlameRow {
    hash: String,
    tag: String,
    author: String,
    date: String,
    message: String,
    version: String,
}

pub(super) fn run(
    root: &Path,
    args: &[OsString],
    component: &str,
    dependency: &str,
    chalk: Chalk,
) -> io::Result<Outcome> {
    let rows = match inspect(root, component, dependency) {
        Ok(rows) => rows,
        Err(Failure::Declined(reason) | Failure::User(reason)) => {
            return Ok(Outcome::Declined(format!("deps blame: {reason}")));
        }
    };
    let data = render(&rows, component, dependency, chalk);
    workspace_command::execute_then(root, args, "blame", |_| {
        Ok(Report { data, code: 0, details: None })
    })
}

fn inspect(root: &Path, component: &str, dependency: &str) -> Result<Vec<BlameRow>, Failure> {
    let ctx = WorkspaceDepsContext::load(root)?;
    let (id, workspace_component) = find_component(&ctx, component)?;
    let mut logs = read_logs(root, id)?;
    logs.reverse();
    logs.sort_by(log::raw_date_order);
    let mut rows = Vec::new();
    let mut last_version = String::new();
    for row in &logs {
        let Some(version) = version_from_log(&ctx, (id, workspace_component), row, dependency)?
        else {
            continue;
        };
        if version == last_version {
            continue;
        }
        last_version.clone_from(&version);
        rows.push(blame_row(row, &version)?);
    }
    Ok(rows)
}

fn version_from_log(
    ctx: &WorkspaceDepsContext,
    component: (&ComponentId, &WorkspaceComponent),
    row: &Value,
    dependency: &str,
) -> Result<Option<String>, Failure> {
    let (id, workspace_component) = component;
    let hash = row["hash"].as_str().ok_or_else(|| Failure::Declined("log hash absent".into()))?;
    let version_id = ComponentId {
        scope: id.effective_scope().map(str::to_owned),
        version: Some(hash.to_owned()),
        ..id.clone()
    };
    let model = ctx.objects
        .component(&version_id)
        .map_err(|error| Failure::Declined(error.to_string()))?
        .ok_or_else(|| Failure::Declined("version object absent".into()))?;
    let identity = Identity {
        scope: id.effective_scope().unwrap_or_default(),
        name: &id.name,
        package_name: &workspace_component.package_name,
    };
    let mut deps = Vec::new();
    ctx.apply_model(&model, &identity, &mut deps);
    Ok(deps
        .iter()
        .find(|dep| matches_dependency(dep, dependency))
        .map(|dep| dep.version.clone()))
}

fn find_component<'a>(
    ctx: &'a WorkspaceDepsContext,
    query: &str,
) -> Result<(&'a ComponentId, &'a WorkspaceComponent), Failure> {
    let matches = ctx.ws.components
        .iter()
        .filter(|component| {
            component.id.name == query || component.id.to_string_without_version() == query
        })
        .collect::<Vec<_>>();
    let [component] = matches.as_slice() else {
        return Err(Failure::Declined("component absent or ambiguous".into()));
    };
    Ok((&component.id, component))
}

fn read_logs(root: &Path, id: &ComponentId) -> Result<Vec<Value>, Failure> {
    let identity = id.to_string_without_version();
    let mut engine = Engine::new().map_err(|error| Failure::Declined(error.to_string()))?;
    let value: Value = engine
        .request(&json!({
            "kind": "componentLog",
            "root": root,
            "identity": identity,
            "lane": null,
            "deprecation": null,
        }))
        .map_err(|error| Failure::Declined(error.to_string()))?;
    value["versions"]
        .as_array()
        .cloned()
        .ok_or_else(|| Failure::Declined("component log versions absent".into()))
}

fn matches_dependency(dep: &ResolvedDep, query: &str) -> bool {
    dep.package_name == query || dep.id == query || dep.comp_bare_id.as_deref() == Some(query)
}

fn blame_row(row: &Value, version: &str) -> Result<BlameRow, Failure> {
    let normalized = log::normalize(row).map_err(|error| Failure::Declined(error.to_string()))?;
    Ok(BlameRow {
        hash: row["hash"]
            .as_str()
            .unwrap_or_default()
            .to_owned(),
        tag: row["tag"]
            .as_str()
            .unwrap_or_default()
            .to_owned(),
        author: row["log"]["username"]
            .as_str()
            .filter(|name| !name.is_empty())
            .unwrap_or("<N/A>")
            .to_owned(),
        date: normalized["date"]
            .as_str()
            .unwrap_or("<N/A>")
            .to_owned(),
        message: row["log"]["message"]
            .as_str()
            .unwrap_or_default()
            .to_owned(),
        version: version.to_owned(),
    })
}

fn render(rows: &[BlameRow], component: &str, dependency: &str, chalk: Chalk) -> String {
    if rows.is_empty() {
        return Formatter::new(chalk).hint(&format!(
            "the specified component {component} does not use the entered dependency {dependency}",
        ));
    }
    let cells = rows
        .iter()
        .map(|row| {
            vec![
                row.hash.as_str(),
                row.tag.as_str(),
                row.author.as_str(),
                row.date.as_str(),
                row.message.as_str(),
                row.version.as_str(),
            ]
        })
        .collect::<Vec<_>>();
    log::table(&cells)
}
