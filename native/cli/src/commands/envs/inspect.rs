//! Native `bit envs [list]` (`bit env [list]`) and `bit envs get <component-name>`.

use crate::{
    commands::{
        color::Chalk,
        list::table,
        scope_set::{Failure, selection},
        script::{
            ScriptHandler, find_workspace_env_component, parse_env_scripts_in_dir,
            resolve_workspace_components,
        },
        workspace_command::{self, format::Formatter, results::Report},
    },
    native::Outcome,
};
use bit_install::{
    config::aspect_id_without_version,
    model::WorkspaceComponent,
    workspace::{BitmapEntry, CORE_ENVS, Workspace},
};
use serde_json::{Value, json};
use std::{env, ffi::OsString, fs, io, path::Path};

pub(super) fn run_list(
    root: &Path,
    args: &[OsString],
    json_flag: bool,
    table_only: bool,
    chalk: Chalk,
) -> Result<Outcome, Failure> {
    let (_, ws) =
        resolve_workspace_components(root).map_err(|err| Failure::Declined(err.to_string()))?;
    let mut pairs = collect_component_envs(&ws);
    pairs.sort_by(|left, right| left.0.cmp(&right.0));
    if json_flag {
        let arr = pairs
            .into_iter()
            .map(|(comp_id, env_id)| json!({ "component": comp_id, "env": env_id }))
            .collect::<Vec<_>>();
        let data =
            serde_json::to_string_pretty(&arr).map_err(|err| Failure::Declined(err.to_string()))?;
        return workspace_command::execute_json(root, args, "envs", |_| {
            Ok(Report { data, code: 0, details: None })
        })
        .map_err(|err| Failure::Declined(err.to_string()));
    }
    let data = format_envs_list(&pairs, table_only, chalk, table::colors(args));
    workspace_command::execute_then(root, args, "envs", |_| {
        Ok(Report { data, code: 0, details: None })
    })
    .map_err(|err| Failure::Declined(err.to_string()))
}

fn collect_component_envs(ws: &Workspace) -> Vec<(String, String)> {
    ws.active()
        .map(|(entry, comp)| (selection::entry_full_id(entry), comp.env_id.clone()))
        .collect()
}

pub(super) fn format_envs_list(
    pairs: &[(String, String)],
    table_only: bool,
    chalk: Chalk,
    colors: bool,
) -> String {
    let rows = pairs
        .iter()
        .map(|(comp_id, env_id)| vec![chalk.white(comp_id), env_id.clone()])
        .collect::<Vec<_>>();
    let rendered_table = table::render(&["component", "env"], &rows, colors);
    if table_only {
        return rendered_table;
    }
    let formatter = Formatter::new(chalk);
    let mut unique_envs = Vec::new();
    for (_, env_id) in pairs {
        if !unique_envs.contains(env_id) {
            unique_envs.push(env_id.clone());
        }
    }
    let env_items = unique_envs
        .iter()
        .map(|env_id| formatter.item(env_id))
        .collect::<Vec<_>>()
        .join("\n");
    let header = format!("{}\n{env_items}", formatter.title("available envs in the workspace"));
    format!("{header}\n\n{rendered_table}")
}

pub(super) fn run_get(
    root: &Path,
    args: &[OsString],
    component: &str,
    services: Option<&[String]>,
    chalk: Chalk,
) -> Result<Outcome, Failure> {
    let data = render_env_get(root, component, services, chalk)?;
    workspace_command::execute_then(root, args, "get", |_| {
        Ok(Report { data, code: 0, details: None })
    })
    .map_err(|err| Failure::Declined(err.to_string()))
}

pub(super) fn render_env_get(
    root: &Path,
    component: &str,
    services: Option<&[String]>,
    chalk: Chalk,
) -> Result<String, Failure> {
    let (_, ws) =
        resolve_workspace_components(root).map_err(|err| Failure::Declined(err.to_string()))?;
    let (_, comp) = find_target_component(&ws, component)?;
    let env_id = &comp.env_id;
    let bare = aspect_id_without_version(env_id);
    if !CORE_ENVS.contains(&bare) && find_workspace_env_component(&ws, bare).is_none() {
        return Err(Failure::Declined(format!("non-workspace env {env_id}")));
    }
    let formatter = Formatter::new(chalk);
    let env_title = formatter.title(&format!("Environment: {env_id}"));
    let mut sections = Vec::new();
    if let Some(env_comp) = find_workspace_env_component(&ws, bare) {
        if let Some(scripts_section) = render_scripts_service(env_comp, services, chalk) {
            sections.push(scripts_section);
        } else if services.is_some() {
            return Err(Failure::Declined("custom service requested".into()));
        }
    } else if services.is_some() {
        return Err(Failure::Declined("service filter on core env".into()));
    }
    if sections.is_empty() {
        return Ok(env_title);
    }
    Ok(format!("{env_title}\n{}", sections.join("\n\n")))
}

fn find_target_component<'a>(
    ws: &'a Workspace,
    query: &str,
) -> Result<(&'a BitmapEntry, &'a WorkspaceComponent), Failure> {
    let normalized = query.trim_start_matches("./").trim_end_matches('/');
    ws.active()
        .find(|(entry, comp)| {
            (!entry.root_dir.is_empty() && entry.root_dir == normalized)
                || comp.id.to_string_without_version() == query
                || comp.id.name == query
                || selection::entry_full_id(entry) == query
        })
        .ok_or_else(|| Failure::User(format!("component for env {query} was not found")))
}

fn render_scripts_service(
    env_comp: &WorkspaceComponent,
    services: Option<&[String]>,
    chalk: Chalk,
) -> Option<String> {
    let service_id = "teambit.workspace/scripts";
    if let Some(filter) = services
        && !filter
            .iter()
            .any(|item| item == service_id)
    {
        return None;
    }
    let env_scripts = parse_env_scripts_in_dir(&env_comp.dir);
    if env_scripts.scripts.is_empty() {
        return None;
    }
    let service_title = chalk.cyan(&chalk.bold(&chalk.underline(service_id)));
    let header = chalk.green("available scripts:");
    let lines = env_scripts.scripts
        .iter()
        .map(|script| {
            let handler_str = match &script.handler {
                ScriptHandler::Function(_) => chalk.gray("[function]"),
                ScriptHandler::Shell(cmd) => chalk.cyan(cmd),
            };
            format!("  {}: {handler_str}", chalk.bold(&script.name))
        })
        .collect::<Vec<_>>()
        .join("\n");
    Some(format!("{service_title}\n\n{header}\n{lines}"))
}

pub(super) fn run_bare_scope_list(
    scope_dir: &Path,
    args: &[OsString],
    chalk: Chalk,
) -> io::Result<Outcome> {
    let Some(pairs) = collect_bare_scope_envs(scope_dir) else {
        return Ok(Outcome::Declined("bare-scope envs list has non-core env".into()));
    };
    let data = format_envs_list(&pairs, true, chalk, table::colors(args));
    let report = Report { data, code: 0, details: None };
    workspace_command::execute_with_scope(scope_dir, args, "envs", &report)
}

pub(super) fn run_bare_scope_get(
    scope_dir: &Path,
    args: &[OsString],
    component: &str,
    chalk: Chalk,
) -> io::Result<Outcome> {
    let Some(rows) = load_bare_scope_index(scope_dir) else {
        return Ok(Outcome::Declined("bare-scope index missing".into()));
    };
    let (bare, req_ver) = component
        .split_once('@')
        .map_or((component, None), |(bare, ver)| (bare, Some(ver)));
    let matched = rows
        .iter()
        .find(|row| {
            row["isSymlink"] != true
                && (row["id"]["name"].as_str() == Some(bare)
                    || bare_row_full_id(scope_dir, row).as_deref() == Some(bare))
        });
    let Some(row) = matched else {
        if env::var_os("CI").is_some_and(|val| !val.is_empty()) {
            return Ok(Outcome::Declined("CI bare-scope envs get error delegated".into()));
        }
        let msg = if bare.contains('/') {
            format!("component for env {component} was not found")
        } else {
            format!(
                r#"Failed parsing the string "{component}": scope is missing. Maybe try to add the scope name prior to the component name, such as "scopeName/componentName""#,
            )
        };
        return workspace_command::execute_failure_scope(
            scope_dir,
            args,
            "get",
            false,
            "",
            io::Error::other(msg),
        );
    };
    let Some(env_id) = bare_row_core_env(scope_dir, row, req_ver) else {
        return Ok(Outcome::Declined("bare-scope component has non-core env".into()));
    };
    let data = Formatter::new(chalk).title(&format!("Environment: {env_id}"));
    let report = Report { data, code: 0, details: None };
    workspace_command::execute_with_scope(scope_dir, args, "get", &report)
}

fn collect_bare_scope_envs(scope_dir: &Path) -> Option<Vec<(String, String)>> {
    let rows = load_bare_scope_index(scope_dir)?;
    let mut pairs = Vec::new();
    for row in &rows {
        if row["isSymlink"] == true {
            continue;
        }
        let full_id = bare_row_full_id_with_ver(scope_dir, row)?;
        let env_id = bare_row_core_env(scope_dir, row, None)?;
        pairs.push((full_id, env_id));
    }
    pairs.sort_by(|left, right| left.0.cmp(&right.0));
    Some(pairs)
}

fn load_bare_scope_index(scope_dir: &Path) -> Option<Vec<Value>> {
    serde_json::from_slice::<Value>(&fs::read(scope_dir.join("index.json")).ok()?)
        .ok()?
        .as_array()
        .cloned()
}

fn bare_row_full_id(scope_dir: &Path, row: &Value) -> Option<String> {
    let name = row["id"]["name"].as_str()?;
    let scope = row["id"]["scope"]
        .as_str()
        .filter(|val| !val.is_empty())
        .map(str::to_owned)
        .or_else(|| {
            let scope_json =
                serde_json::from_slice::<Value>(&fs::read(scope_dir.join("scope.json")).ok()?)
                    .ok()?;
            scope_json["name"].as_str().map(str::to_owned)
        })?;
    Some(format!("{scope}/{name}"))
}

fn bare_row_full_id_with_ver(scope_dir: &Path, row: &Value) -> Option<String> {
    let base = bare_row_full_id(scope_dir, row)?;
    let hash = row["hash"].as_str()?;
    let (kind, comp_obj) = bit_object_import::read_scope_object(scope_dir, hash).ok()??;
    if kind != "Component" || comp_obj["deprecated"] == true || comp_obj["deleted"] == true {
        return None;
    }
    let head = comp_obj["head"].as_str()?;
    let ver = comp_obj["versions"]
        .as_object()
        .and_then(|vers| {
            vers.iter()
                .find(|(_, ver_hash)| ver_hash.as_str() == Some(head))
                .map(|(tag, _)| tag.as_str())
        })
        .unwrap_or(head);
    Some(format!("{base}@{ver}"))
}

fn bare_row_core_env(scope_dir: &Path, row: &Value, req_ver: Option<&str>) -> Option<String> {
    let hash = row["hash"].as_str()?;
    let (kind, comp_obj) = bit_object_import::read_scope_object(scope_dir, hash).ok()??;
    if kind != "Component" {
        return None;
    }
    let ver_hash = match req_ver {
        Some(ver) => comp_obj["versions"][ver].as_str().unwrap_or(ver),
        None => comp_obj["head"].as_str()?,
    };
    let (ver_kind, ver_obj) = bit_object_import::read_scope_object(scope_dir, ver_hash).ok()??;
    if ver_kind != "Version" {
        return None;
    }
    let env_id = ver_obj["extensions"]
        .as_array()
        .and_then(|exts| {
            exts.iter()
                .find(|ext| ext["name"].as_str() == Some("teambit.envs/envs"))
                .and_then(|ext| {
                    ext["config"]["env"]
                        .as_str()
                        .or_else(|| ext["data"]["id"].as_str())
                })
        })
        .unwrap_or("teambit.harmony/node");
    let bare_env = aspect_id_without_version(env_id);
    CORE_ENVS.contains(&bare_env).then(|| env_id.to_owned())
}
