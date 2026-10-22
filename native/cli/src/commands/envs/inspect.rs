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
use serde_json::json;
use std::{ffi::OsString, path::Path};

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
