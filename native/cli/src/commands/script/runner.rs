//! Workspace environment resolution, script listing, and script execution.

use super::{
    Options,
    parser::{EnvScripts, ScriptHandler, eval_function_logs, parse_env_scripts_in_dir},
};
use crate::commands::color::Chalk;
use bit_install::{
    config::{ENVS_ASPECT, WorkspaceConfig, aspect_id_without_version},
    model::WorkspaceComponent,
    workspace::{CORE_ENVS, DEFAULT_ENV, Workspace},
};
use bit_object_import::parse_jsonc;
use serde_json::Value;
use std::{fs, io, path::Path, process::Command};

const CORE_ASPECT_IDS: &str =
    include_str!("../../../../../scopes/harmony/testing/load-aspect/core-aspects-ids.json");

pub(super) enum ScriptFailure {
    User(String),
    Declined(String),
}

struct EnvGroup<'a> {
    env_id: String,
    components: Vec<&'a WorkspaceComponent>,
    env_scripts: EnvScripts,
}

pub(in crate::commands) fn resolve_workspace_components(
    root: &Path,
) -> io::Result<(WorkspaceConfig, Workspace)> {
    let ws_config = WorkspaceConfig::load(root)?;
    let core_ids: Vec<String> = serde_json::from_str(CORE_ASPECT_IDS).map_err(io::Error::other)?;
    let mut ws = Workspace::load(root, &ws_config, &core_ids)?;
    promote_bit_env_plugin_components(&mut ws, &core_ids);
    Ok((ws_config, ws))
}

fn promote_bit_env_plugin_components(ws: &mut Workspace, core_ids: &[String]) {
    let plugin_envs = collect_plugin_env_ids(ws);
    for comp in &mut ws.components {
        assign_plugin_env_to_comp(comp, &plugin_envs, core_ids);
    }
}

fn collect_plugin_env_ids(ws: &mut Workspace) -> Vec<String> {
    let mut plugin_envs = Vec::new();
    for comp in &mut ws.components {
        if comp.files
            .iter()
            .any(|file| file.contains(".bit-env."))
        {
            comp.is_env = true;
        }
        if comp.is_env {
            plugin_envs.push(comp.id.to_string_without_version());
        }
    }
    plugin_envs
}

fn assign_plugin_env_to_comp(
    comp: &mut WorkspaceComponent,
    plugin_envs: &[String],
    core_ids: &[String],
) {
    if comp.env_id != DEFAULT_ENV || has_explicit_env(comp) {
        return;
    }
    let Some(matched_key) = comp.config
        .keys()
        .find(|key| is_matching_plugin_env(key, plugin_envs, core_ids))
        .cloned()
    else {
        return;
    };
    comp.env_id = matched_key;
}

fn is_matching_plugin_env(key: &str, plugin_envs: &[String], core_ids: &[String]) -> bool {
    let without = aspect_id_without_version(key);
    without != ENVS_ASPECT
        && !core_ids
            .iter()
            .any(|core| core == without)
        && plugin_envs
            .iter()
            .any(|env_id| env_id == without)
}

fn has_explicit_env(comp: &WorkspaceComponent) -> bool {
    comp.config.contains_key(DEFAULT_ENV)
        || comp.config
            .get(ENVS_ASPECT)
            .and_then(|cfg| cfg.get("env"))
            .is_some()
}

pub(super) fn read_allowed_envs(ws_jsonc: &Value) -> Vec<String> {
    let Some(obj) = ws_jsonc.as_object() else {
        return Vec::new();
    };
    let scripts_val = obj
        .iter()
        .find(|(key, _)| aspect_id_without_version(key) == "teambit.workspace/scripts")
        .map(|(_, val)| val);
    let Some(arr) = scripts_val.and_then(|val| val["envs"].as_array()) else {
        return Vec::new();
    };
    arr.iter()
        .filter_map(Value::as_str)
        .filter(|text| !text.is_empty())
        .map(str::to_owned)
        .collect()
}

pub(super) fn is_env_allowed(env_id: &str, allowed_envs: &[String]) -> bool {
    allowed_envs
        .iter()
        .any(|allowed| {
            if env_id == allowed {
                return true;
            }
            if !allowed.contains('@') {
                let prefix = format!("{allowed}@");
                if env_id.starts_with(&prefix) {
                    return true;
                }
            }
            false
        })
}

pub(super) fn execute(
    root: &Path,
    options: &Options,
    chalk: Chalk,
) -> Result<String, ScriptFailure> {
    let ws_bytes = fs::read(root.join("workspace.jsonc"))
        .map_err(|err| ScriptFailure::Declined(err.to_string()))?;
    let ws_jsonc = parse_jsonc(&ws_bytes).map_err(|err| ScriptFailure::Declined(err.to_string()))?;
    let allowed_envs = read_allowed_envs(&ws_jsonc);
    let (_, ws) =
        resolve_workspace_components(root).map_err(|err| ScriptFailure::Declined(err.to_string()))?;
    let groups = build_env_groups(&ws, &allowed_envs)?;
    if options.list {
        return Ok(render_list(&groups, chalk));
    }
    let Some(script_name) = options.script_name.as_deref() else {
        return Err(ScriptFailure::User(
            "script name is required. Use --list to see available scripts.".into(),
        ));
    };
    run_named_script(root, &groups, script_name, chalk)
}

fn build_env_groups<'a>(
    ws: &'a Workspace,
    allowed_envs: &[String],
) -> Result<Vec<EnvGroup<'a>>, ScriptFailure> {
    let mut grouped: Vec<(String, Vec<&'a WorkspaceComponent>)> = Vec::new();
    for (_, comp) in ws.active() {
        if !is_env_allowed(&comp.env_id, allowed_envs) {
            continue;
        }
        if let Some((_, list)) = grouped
            .iter_mut()
            .find(|(env_id, _)| *env_id == comp.env_id)
        {
            list.push(comp);
        } else {
            grouped.push((comp.env_id.clone(), vec![comp]));
        }
    }
    let mut out = Vec::with_capacity(grouped.len());
    for (env_id, components) in grouped {
        let bare = aspect_id_without_version(&env_id);
        if CORE_ENVS.contains(&bare) {
            continue;
        }
        let Some(env_comp) = find_workspace_env_component(ws, bare) else {
            return Err(ScriptFailure::Declined(format!("external env {env_id}")));
        };
        let env_scripts = parse_env_scripts_in_dir(&env_comp.dir);
        out.push(EnvGroup { env_id, components, env_scripts });
    }
    Ok(out)
}

pub(in crate::commands) fn find_workspace_env_component<'a>(
    ws: &'a Workspace,
    bare_env_id: &str,
) -> Option<&'a WorkspaceComponent> {
    ws.entries
        .iter()
        .zip(&ws.components)
        .find(|(entry, comp)| {
            entry.owns_its_dir()
                && (comp.id.to_string_without_version() == bare_env_id
                    || comp.id.name == bare_env_id)
        })
        .map(|(_, comp)| comp)
}

fn render_list(groups: &[EnvGroup<'_>], chalk: Chalk) -> String {
    let mut results = Vec::new();
    for group in groups {
        if group.env_scripts.scripts.is_empty() {
            continue;
        }
        if results.is_empty() {
            results.push(chalk.green("Available scripts:\n"));
        }
        results.extend(format_group_scripts(group, chalk));
    }
    if results.is_empty() {
        return chalk.yellow("no scripts defined in the configured environments");
    }
    results.join("\n")
}

fn format_group_scripts(group: &EnvGroup<'_>, chalk: Chalk) -> Vec<String> {
    let mut lines = vec![
        chalk.cyan(&format!("\nEnvironment: {}", group.env_id)),
        chalk.gray(&format!("  (used by {} component(s))", group.components.len())),
    ];
    for script in &group.env_scripts.scripts {
        let handler_str = match &script.handler {
            ScriptHandler::Function(_) => chalk.gray("[function]"),
            ScriptHandler::Shell(cmd) => chalk.white(cmd),
        };
        lines.push(format!("  {}: {handler_str}", chalk.bold(&script.name)));
    }
    lines
}

fn run_named_script(
    root: &Path,
    groups: &[EnvGroup<'_>],
    script_name: &str,
    chalk: Chalk,
) -> Result<String, ScriptFailure> {
    let mut results = Vec::new();
    for group in groups {
        if !group.env_scripts.has_scripts_method {
            continue;
        }
        let Some(script) = group.env_scripts.scripts
            .iter()
            .find(|item| item.name == script_name)
        else {
            return Err(ScriptFailure::User(format!(
                r#"script "{script_name}" was not found in environment "{}""#,
                group.env_id,
            )));
        };
        let title = chalk.green(&format!(
            "\nRunning script \"{script_name}\" for {} component(s) with env {}:",
            group.components.len(),
            group.env_id,
        ));
        results.push(title);
        let result = match &script.handler {
            ScriptHandler::Shell(cmd) => execute_shell_command(root, cmd, chalk),
            ScriptHandler::Function(body) => {
                execute_function_body(body, group.components.len(), chalk)
            }
        };
        results.push(result);
    }
    Ok(results.join("\n"))
}

fn execute_shell_command(root: &Path, command_str: &str, chalk: Chalk) -> String {
    let mut cmd = if cfg!(windows) {
        let mut command = Command::new("cmd");
        command.args(["/C", command_str]);
        command
    } else {
        let mut command = Command::new("sh");
        command.args(["-c", command_str]);
        command
    };
    match cmd.current_dir(root).output() {
        Ok(output) if output.status.success() => {
            let stdout = String::from_utf8_lossy(&output.stdout);
            chalk.white(&stdout)
        }
        Ok(output) => {
            let stderr = String::from_utf8_lossy(&output.stderr);
            let err_msg = if stderr.is_empty() { "unknown error" } else { stderr.as_ref() };
            chalk.red(&format!("Error executing script: {err_msg}"))
        }
        Err(err) => chalk.red(&format!("Error executing script: {err}")),
    }
}

fn execute_function_body(body: &str, component_count: usize, chalk: Chalk) -> String {
    let logs = eval_function_logs(body, component_count);
    let success = chalk.green("✓ Script function executed successfully");
    if logs.is_empty() { success } else { format!("{}\n{success}", logs.join("\n")) }
}
