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
use std::{env, ffi::OsString, fs, io, path::Path};

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
        Err(Failure::User(message)) => {
            if env::var_os("CI").is_some_and(|val| !val.is_empty()) {
                return Ok(Outcome::Declined("CI deps blame error stack".into()));
            }
            return workspace_command::execute_then(root, args, "blame", |_| {
                Err(io::Error::other(message))
            });
        }
        Err(Failure::Declined(reason)) => {
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
    let Some((id, workspace_component)) = find_component(root, &ctx, component)? else {
        return Ok(Vec::new());
    };
    if id.version.as_deref().is_none_or(str::is_empty) {
        return Ok(Vec::new());
    }
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
    root: &Path,
    ctx: &'a WorkspaceDepsContext,
    query: &str,
) -> Result<Option<(&'a ComponentId, &'a WorkspaceComponent)>, Failure> {
    let bare = query.split('@').next().unwrap_or(query);
    let normalized = bare.trim_start_matches("./").trim_end_matches('/');
    let matches = ctx.ws.entries
        .iter()
        .zip(&ctx.ws.components)
        .filter(|(entry, component)| {
            entry.owns_its_dir()
                && (component.id.name == bare
                    || component.id.to_string_without_version() == bare
                    || (!entry.root_dir.is_empty() && entry.root_dir == normalized))
        })
        .map(|(_, component)| component)
        .collect::<Vec<_>>();
    if let [component] = matches.as_slice() {
        return Ok(Some((&component.id, component)));
    }
    if !matches.is_empty() {
        return Err(Failure::Declined("component ambiguous".into()));
    }
    if !bare.contains('/') && !exists_in_scope_index(root, bare) {
        return Err(Failure::User(format!(
            r#"Failed parsing the string "{query}": scope is missing. Maybe try to add the scope name prior to the component name, such as "scopeName/componentName""#,
        )));
    }
    if bare.contains('/') && !exists_in_scope_index(root, bare) {
        return Ok(None);
    }
    Err(Failure::Declined("scope-only component blame delegated".into()))
}

fn exists_in_scope_index(root: &Path, bare: &str) -> bool {
    let index_path = crate::workspace::scope_path(root).join("index.json");
    let Ok(bytes) = fs::read(index_path) else {
        return false;
    };
    let Ok(index) = serde_json::from_slice::<Value>(&bytes) else {
        return false;
    };
    let Some(rows) = index["components"].as_array().or_else(|| index.as_array()) else {
        return false;
    };
    let target_name = bare.split_once('/').map_or(bare, |(_, name)| name);
    rows.iter()
        .any(|row| row["isSymlink"] != true && row["id"]["name"].as_str() == Some(target_name))
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
