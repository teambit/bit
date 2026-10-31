//! Native `bit create <template-name> <component-names...>` (`CreateCmd`).
//!
//! Validates CLI arguments, workspace presence, `--scope` format, and
//! same-name-as-template errors natively before delegating template generation
//! and aspect loading to the Node.js CLI when needed.

#[cfg(test)]
mod tests;

use super::{
    Command, scope_set,
    workspace_command::{self, results::Report},
};
use crate::{native::Outcome, workspace};
use std::{env, ffi::OsString, io, path::Path};

pub const COMMAND: Command = Command { name: "create", aliases: &[], run };

const OUTSIDE_WORKSPACE_ERR: &str = "This command can only be run inside a bit workspace. Please check that you are inside a bit workspace and then re-run (to initialize a new workspace please use bit init)";

#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) struct Options {
    pub template_name: String,
    pub component_names: Vec<String>,
    pub scope: Option<String>,
    pub namespace: Option<String>,
}

fn run(args: &[OsString]) -> io::Result<Outcome> {
    let Some(argv) = workspace_command::utf8_args(args) else {
        return Ok(Outcome::Declined("create arguments are not UTF-8".into()));
    };
    let Some(options) = parse_options(&argv[1..]) else {
        return Ok(Outcome::Declined("outside native create grammar".into()));
    };
    if env::var_os("CI").is_some_and(|val| !val.is_empty()) {
        return Ok(Outcome::Declined("CI create error stack".into()));
    }
    let cwd = env::current_dir()?;
    let Some(root) = workspace::root(&cwd) else {
        return workspace_command::execute_without_loader_scope(&cwd, args, "create", |_| {
            Err(io::Error::other(OUTSIDE_WORKSPACE_ERR))
        });
    };
    if let Err(err) = validate_options(&root, &options) {
        return workspace_command::execute_then(
            &root,
            args,
            "create",
            move |_| -> io::Result<Report> { Err(io::Error::other(err)) },
        );
    }
    Ok(Outcome::Declined("create requires generator aspect runtime".into()))
}

fn parse_scope_from_component_id_str(raw: &str) -> (Option<&str>, &str) {
    let Some((potential_scope, rest)) = raw.split_once('/') else {
        return (None, raw);
    };
    if potential_scope.contains('.') && scope_set::selection::valid_scope_str(potential_scope) {
        return (Some(potential_scope), rest);
    }
    (None, raw)
}

pub(super) fn validate_options(_root: &Path, options: &Options) -> Result<(), String> {
    if let Some(scope) = options.scope.as_deref()
        && !scope_set::selection::valid_scope_str(scope)
    {
        return Err(format!(
            r#"error: "{scope}" is invalid, component scope names can only contain alphanumeric, lowercase characters, and the following ["-", "_", "$", "!"]"#,
        ));
    }
    for raw_name in &options.component_names {
        let (_parsed_scope, parsed_name) = parse_scope_from_component_id_str(raw_name.trim());
        let full_name = match options.namespace
            .as_deref()
            .map(str::trim)
            .filter(|ns| !ns.is_empty())
        {
            Some(ns) => format!("{ns}/{parsed_name}"),
            None => parsed_name.to_owned(),
        };
        if full_name == options.template_name.trim() {
            let pascal = pascal_case(&options.template_name);
            return Err(format!(
                "unable to create a component with the same name as the template \"{}\", please use a different name.\nthe reason is that after refactoring, the code will have this invalid class: \"class {pascal} extends {pascal} {{}}\"",
                options.template_name,
            ));
        }
    }
    Ok(())
}

fn pascal_case(input: &str) -> String {
    let mut out = String::new();
    let mut capitalize_next = true;
    for ch in input.chars() {
        if !ch.is_ascii_alphanumeric() {
            capitalize_next = true;
            continue;
        }
        if capitalize_next {
            out.push(ch.to_ascii_uppercase());
            capitalize_next = false;
        } else {
            out.push(ch);
        }
    }
    out
}

pub(super) fn parse_options(args: &[&str]) -> Option<Options> {
    let mut positionals = Vec::new();
    let mut scope = None;
    let mut namespace = None;
    let mut iter = args.iter().copied();
    while let Some(token) = iter.next() {
        if token == "--" {
            for item in iter {
                positionals.push(take_value(item)?);
            }
            break;
        }
        apply_create_token(token, &mut iter, &mut scope, &mut namespace, &mut positionals)?;
    }
    if positionals.len() < 2 {
        return None;
    }
    let template_name = positionals.remove(0);
    Some(Options { template_name, component_names: positionals, scope, namespace })
}

fn apply_create_token<'a>(
    token: &'a str,
    iter: &mut impl Iterator<Item = &'a str>,
    scope: &mut Option<String>,
    namespace: &mut Option<String>,
    positionals: &mut Vec<String>,
) -> Option<()> {
    match token {
        "--no-color" | "--no-color=true" | "--no-color=false" | "--force" | "--force=true"
        | "--force=false" | "-f" => {}
        "--scope" | "-s" => *scope = Some(take_value(iter.next()?)?),
        "--namespace" | "-n" => *namespace = Some(take_value(iter.next()?)?),
        "--aspect" | "-a" | "--template" | "-t" | "--path" | "-p" | "--env" | "-e" => {
            take_value(iter.next()?)?;
        }
        _ if let Some(val) = token
            .strip_prefix("--scope=")
            .or_else(|| token.strip_prefix("-s=")) =>
        {
            *scope = Some(take_value(val)?);
        }
        _ if let Some(val) = token
            .strip_prefix("--namespace=")
            .or_else(|| token.strip_prefix("-n=")) =>
        {
            *namespace = Some(take_value(val)?);
        }
        _ if has_inline_create_value(token) => {}
        _ => positionals.push(take_value(token)?),
    }
    Some(())
}

fn take_value(val: &str) -> Option<String> {
    let val = val.trim();
    (!val.is_empty() && !val.starts_with('-')).then(|| val.to_owned())
}

fn has_inline_create_value(token: &str) -> bool {
    [
        "--namespace=",
        "-n=",
        "--aspect=",
        "-a=",
        "--template=",
        "-t=",
        "--path=",
        "-p=",
        "--env=",
        "-e=",
    ]
    .iter()
    .any(|prefix| {
        token
            .strip_prefix(prefix)
            .map(str::trim)
            .is_some_and(|val| !val.is_empty() && !val.starts_with('-'))
    })
}
