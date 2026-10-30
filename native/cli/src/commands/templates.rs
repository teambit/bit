//! Native `bit templates` (`scopes/generator/generator/templates.cmd.ts`).

mod catalog;
#[cfg(test)]
mod tests;

use self::catalog::{WORKSPACE_STARTER_ASPECTS, format_templates_report, select_templates};
use super::{
    Command,
    color::Chalk,
    script::resolve_workspace_components,
    workspace_command::{self, results::Report},
};
use crate::{native::Outcome, workspace};
use bit_install::{config::aspect_id_without_version, workspace::CORE_ENVS};
use bit_object_import::parse_jsonc;
use serde_json::Value;
use std::{
    env,
    ffi::OsString,
    fs,
    io::{self, Write},
    path::Path,
    process::ExitCode,
};

pub const COMMAND: Command = Command { name: "templates", aliases: &[], run };

const CORE_ASPECT_IDS: &str =
    include_str!("../../../../scopes/harmony/testing/load-aspect/core-aspects-ids.json");

#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) struct Options {
    pub show_all: bool,
    pub aspect: Option<String>,
    pub json: bool,
}

fn run(args: &[OsString]) -> io::Result<Outcome> {
    let Some(argv) = workspace_command::utf8_args(args) else {
        return Ok(Outcome::Declined("templates arguments are not UTF-8".into()));
    };
    let Some(options) = parse_options(&argv[1..]) else {
        return Ok(Outcome::Declined("outside native templates grammar".into()));
    };
    if env::var_os("CI").is_some_and(|val| !val.is_empty()) {
        return Ok(Outcome::Declined("CI templates delegated".into()));
    }
    let cwd = env::current_dir()?;
    let chalk = Chalk::detect(args);
    match workspace::root(&cwd) {
        Some(root) => run_inside_workspace(&root, args, &options, chalk),
        None => run_outside_workspace(&cwd, args, &options, chalk),
    }
}

fn run_outside_workspace(
    cwd: &Path,
    args: &[OsString],
    options: &Options,
    chalk: Chalk,
) -> io::Result<Outcome> {
    if let Some(aspect) = &options.aspect
        && !WORKSPACE_STARTER_ASPECTS.contains(&aspect.as_str())
    {
        return Ok(Outcome::Declined("templates outside workspace aspect delegated".into()));
    }
    let templates = select_templates(false, options.show_all, options.aspect.as_deref());
    if options.json {
        let data = serde_json::to_string_pretty(&templates).map_err(io::Error::other)?;
        let mut stdout = io::stdout().lock();
        stdout.write_all(data.as_bytes())?;
        stdout.flush()?;
        return Ok(Outcome::Exit(ExitCode::SUCCESS));
    }
    let data = format_templates_report(&templates, false, chalk);
    let report = Report { data, code: 0, details: None };
    workspace_command::execute_with_scope(cwd, args, "templates", &report)
}

fn run_inside_workspace(
    root: &Path,
    args: &[OsString],
    options: &Options,
    chalk: Chalk,
) -> io::Result<Outcome> {
    if !can_use_builtin_workspace_templates(root, options.aspect.as_deref()) {
        return Ok(Outcome::Declined("templates custom generator config delegated".into()));
    }
    let templates = select_templates(true, options.show_all, options.aspect.as_deref());
    if options.json {
        let data = serde_json::to_string_pretty(&templates).map_err(io::Error::other)?;
        return workspace_command::execute_json(root, args, "templates", |_| {
            Ok(Report { data, code: 0, details: None })
        });
    }
    let data = format_templates_report(&templates, true, chalk);
    workspace_command::execute_then(root, args, "templates", |_| {
        Ok(Report { data, code: 0, details: None })
    })
}

pub(super) fn can_use_builtin_workspace_templates(
    root: &Path,
    aspect_filter: Option<&str>,
) -> bool {
    let Ok(bytes) = fs::read(root.join("workspace.jsonc")) else {
        return false;
    };
    let Ok(ws_val) = parse_jsonc(&bytes) else {
        return false;
    };
    if has_custom_generator_config(&ws_val) {
        return false;
    }
    let Ok(core_ids) = serde_json::from_str::<Vec<String>>(CORE_ASPECT_IDS) else {
        return false;
    };
    if let Some(aspect) = aspect_filter
        && !core_ids
            .iter()
            .any(|core| core == aspect)
    {
        return false;
    }
    if has_non_core_workspace_aspect(&ws_val, &core_ids) {
        return false;
    }
    let Ok((_, ws)) = resolve_workspace_components(root) else {
        return false;
    };
    ws.active()
        .all(|(_, comp)| CORE_ENVS.contains(&aspect_id_without_version(&comp.env_id)))
}

fn has_custom_generator_config(ws_val: &Value) -> bool {
    let gen_cfg = &ws_val["teambit.generator/generator"];
    if gen_cfg["hideCoreTemplates"].as_bool() == Some(true) {
        return true;
    }
    let has_envs = gen_cfg["envs"]
        .as_array()
        .is_some_and(|arr| !arr.is_empty());
    let has_aspects = gen_cfg["aspects"]
        .as_array()
        .is_some_and(|arr| !arr.is_empty());
    has_envs || has_aspects
}

fn has_non_core_workspace_aspect(ws_val: &Value, core_ids: &[String]) -> bool {
    let Some(obj) = ws_val.as_object() else {
        return true;
    };
    obj.keys()
        .any(|key| {
            if key == "$schema" {
                return false;
            }
            let bare = aspect_id_without_version(key);
            !core_ids.iter().any(|core| core == bare)
        })
}

pub(super) fn parse_options(args: &[&str]) -> Option<Options> {
    let mut options = Options { show_all: false, aspect: None, json: false };
    let mut iter = args.iter().copied();
    while let Some(token) = iter.next() {
        if token == "--" {
            return iter.next().is_none().then_some(options);
        }
        apply_templates_token(token, &mut iter, &mut options)?;
    }
    Some(options)
}

fn apply_templates_token<'a>(
    token: &'a str,
    iter: &mut impl Iterator<Item = &'a str>,
    options: &mut Options,
) -> Option<()> {
    match token {
        "--no-color" => {}
        "--show-all" | "--show-all=true" | "-s" => options.show_all = true,
        "--show-all=false" => options.show_all = false,
        "--json" | "--json=true" | "-j" => options.json = true,
        "--json=false" => options.json = false,
        "-sj" | "-js" => {
            options.show_all = true;
            options.json = true;
        }
        "--aspect" | "-a" => {
            let val = iter.next()?;
            options.aspect =
                Some((!val.is_empty() && !val.starts_with('-')).then(|| val.to_owned())?);
        }
        _ if let Some(val) = token
            .strip_prefix("--aspect=")
            .or_else(|| token.strip_prefix("-a=")) =>
        {
            options.aspect =
                Some((!val.is_empty() && !val.starts_with('-')).then(|| val.to_owned())?);
        }
        _ => return None,
    }
    Some(())
}
