//! Native `bit app [subcommand]` (`scopes/harmony/application/app.cmd.ts`, alias `apps`).

#[cfg(test)]
mod tests;

use super::{
    Command,
    color::Chalk,
    list::table,
    scope_set::selection,
    script::active_component_count,
    workspace_command::{self, results::Report},
};
use crate::{native::Outcome, workspace};
use bit_install::{
    config::{WorkspaceConfig, aspect_id_without_version},
    model::WorkspaceComponent,
    workspace::{BitmapEntry, CORE_ENVS, Workspace},
};
use bit_object_import::parse_jsonc;
use serde_json::json;
use std::{
    env,
    ffi::OsString,
    fs,
    io::{self, Write},
    path::Path,
    process::ExitCode,
};

pub const COMMAND: Command = Command { name: "app", aliases: &["apps"], run };

const CORE_ASPECT_IDS: &str =
    include_str!("../../../../scopes/harmony/testing/load-aspect/core-aspects-ids.json");

#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub(super) struct Options {
    pub json: bool,
}

fn run(args: &[OsString]) -> io::Result<Outcome> {
    let Some(argv) = workspace_command::utf8_args(args) else {
        return Ok(Outcome::Declined("app arguments are not UTF-8".into()));
    };
    let Some(options) = parse_options(&argv[1..]) else {
        return Ok(Outcome::Declined("outside native app grammar".into()));
    };
    if env::var_os("CI").is_some_and(|val| !val.is_empty()) {
        return Ok(Outcome::Declined("CI app delegated".into()));
    }
    let cwd = env::current_dir()?;
    let Some(root) = workspace::root(&cwd) else {
        return run_outside_workspace(args, &argv);
    };
    if let Some(apps) = discover_workspace_apps(&root) {
        return emit_apps_outcome(&root, args, &options, &apps);
    }
    Ok(Outcome::Declined("app list delegated".into()))
}

fn run_outside_workspace(args: &[OsString], argv: &[&str]) -> io::Result<Outcome> {
    match &argv[1..] {
        ["list", "-j" | "--json"] => {
            io::stdout().lock().write_all(b"[]")?;
        }
        [] | ["list"] => {
            let chalk = Chalk::detect(args);
            let label = if argv.len() == 1 { "app" } else { "list" };
            let output = workspace_command::loader_output(chalk, false);
            output.restart(&format!(r#"running command "{label}"..."#));
            output.stop();
            writeln!(io::stdout().lock(), "{}", chalk.yellow("no apps found"))?;
        }
        _ => return Ok(Outcome::Declined("app outside workspace grammar delegated".into())),
    }
    Ok(Outcome::Exit(ExitCode::SUCCESS))
}

fn emit_apps_outcome(
    root: &Path,
    args: &[OsString],
    options: &Options,
    apps: &[(String, String)],
) -> io::Result<Outcome> {
    let chalk = Chalk::detect(args);
    if options.json {
        let items: Vec<_> = apps
            .iter()
            .map(|(id, name)| json!({ "id": id, "name": name }))
            .collect();
        let data = serde_json::to_string_pretty(&items).unwrap_or_else(|_| "[]".to_owned());
        return workspace_command::execute_json(root, args, "app", move |_| {
            Ok(Report { data, code: 0, details: None })
        });
    }
    let data = if apps.is_empty() {
        chalk.yellow("no apps found")
    } else {
        let rows: Vec<Vec<String>> = apps
            .iter()
            .map(|(id, name)| vec![chalk.white(id), name.clone()])
            .collect();
        table::render(&["id", "name"], &rows, table::colors(args))
    };
    workspace_command::execute_without_loader(root, args, "app", move |_| {
        Ok(Report { data, code: 0, details: None })
    })
}

pub(super) fn is_empty_app_workspace(root: &Path) -> io::Result<bool> {
    if let Some(apps) = discover_workspace_apps(root) {
        return Ok(apps.is_empty());
    }
    let ws_config = parse_jsonc(&fs::read(root.join("workspace.jsonc"))?)?;
    if ws_config["teambit.workspace/workspace"]["bitmapAutoSync"] == true {
        return Ok(false);
    }
    if has_custom_root_aspects(&ws_config) {
        return Ok(false);
    }
    let bitmap = parse_jsonc(&fs::read(root.join(".bitmap"))?)?;
    Ok(active_component_count(&bitmap) == 0)
}

fn has_custom_root_aspects(ws_config: &serde_json::Value) -> bool {
    ws_config
        .as_object()
        .is_some_and(|obj| {
            obj.keys()
                .any(|key| !key.starts_with('$') && !key.starts_with("teambit."))
        })
}

pub(super) fn discover_workspace_apps(root: &Path) -> Option<Vec<(String, String)>> {
    let raw_ws = parse_jsonc(&fs::read(root.join("workspace.jsonc")).ok()?).ok()?;
    if raw_ws["teambit.workspace/workspace"]["bitmapAutoSync"] == true
        || has_custom_root_aspects(&raw_ws)
    {
        return None;
    }
    let raw_bitmap = parse_jsonc(&fs::read(root.join(".bitmap")).ok()?).ok()?;
    if active_component_count(&raw_bitmap) == 0 {
        return Some(Vec::new());
    }
    let ws_config = WorkspaceConfig::load(root).ok()?;
    let core_ids: Vec<String> = serde_json::from_str(CORE_ASPECT_IDS).ok()?;
    let ws = Workspace::load(root, &ws_config, &core_ids).ok()?;
    let mut apps = Vec::new();
    for (entry, comp) in ws.active() {
        collect_component_apps(entry, comp, &mut apps)?;
    }
    Some(apps)
}

fn collect_component_apps(
    entry: &BitmapEntry,
    comp: &WorkspaceComponent,
    apps: &mut Vec<(String, String)>,
) -> Option<()> {
    let bare_env = aspect_id_without_version(&comp.env_id);
    if !CORE_ENVS.contains(&bare_env) {
        return None;
    }
    for rel_file in &comp.files {
        if is_app_plugin_file(rel_file) {
            let content = fs::read_to_string(comp.dir.join(rel_file)).ok()?;
            let app_name = extract_app_name(&content)?;
            apps.push((selection::entry_full_id(entry), app_name));
        }
    }
    Some(())
}

fn is_app_plugin_file(rel_file: &str) -> bool {
    rel_file.contains(".bit-app.")
        || rel_file.contains(".app-root.")
        || rel_file.contains(".node-app.")
        || rel_file.contains(".react-app.")
}

pub(super) fn extract_app_name(content: &str) -> Option<String> {
    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with("//") || trimmed.starts_with("/*") {
            continue;
        }
        if let Some(name) = extract_name_from_line(trimmed) {
            return Some(name);
        }
    }
    None
}

fn extract_name_from_line(line: &str) -> Option<String> {
    let mut rest = line;
    while let Some(pos) = rest.find("name:") {
        let valid_prefix = pos == 0
            || !rest.as_bytes()[pos - 1].is_ascii_alphanumeric()
                && rest.as_bytes()[pos - 1] != b'_'
                && rest.as_bytes()[pos - 1] != b'$';
        let after = rest[pos + "name:".len()..].trim_start();
        if valid_prefix && let Some(extracted) = parse_quoted_literal(after) {
            return Some(extracted);
        }
        rest = &rest[pos + "name:".len()..];
    }
    None
}

fn parse_quoted_literal(input: &str) -> Option<String> {
    let quote = input.chars().next()?;
    if !matches!(quote, '\'' | '"' | '`') {
        return None;
    }
    let rest = &input[quote.len_utf8()..];
    let end = rest.find(quote)?;
    let val = &rest[..end];
    if val.is_empty() || val.contains("${") {
        return None;
    }
    Some(val.to_owned())
}

pub(super) fn parse_options(args: &[&str]) -> Option<Options> {
    let mut json = false;
    let mut saw_list = false;
    for &arg in args {
        match arg {
            "--no-color" => {}
            "-j" | "--json" => json = true,
            "list" if !saw_list => saw_list = true,
            _ => return None,
        }
    }
    Some(Options { json })
}
