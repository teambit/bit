//! Native `bit new <template-name> <workspace-name>` (`NewCmd`).
//!
//! Validates CLI arguments, workspace non-existence, target path existence,
//! and `--load-from` preconditions natively before delegating starter template
//! execution to the Node.js CLI when needed.

#[cfg(test)]
mod tests;

use super::{
    Command,
    workspace_command::{self, results::Report},
};
use crate::{native::Outcome, workspace};
use std::{env, ffi::OsString, io, path::Path};

pub const COMMAND: Command = Command { name: "new", aliases: &[], run };

#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) struct Options {
    pub template_name: String,
    pub workspace_name: String,
    pub aspect: Option<String>,
    pub load_from: Option<String>,
    pub current_dir: bool,
}

const BUILTIN_WORKSPACE_TEMPLATES: &[&str] = &["basic", "react", "platform", "harmony"];

fn run(args: &[OsString]) -> io::Result<Outcome> {
    let Some(argv) = workspace_command::utf8_args(args) else {
        return Ok(Outcome::Declined("new arguments are not UTF-8".into()));
    };
    let Some(options) = parse_options(&argv[1..]) else {
        return Ok(Outcome::Declined("outside native new grammar".into()));
    };
    if env::var_os("CI").is_some_and(|val| !val.is_empty()) {
        return Ok(Outcome::Declined("CI new error stack".into()));
    }
    let cwd = env::current_dir()?;
    if let Err(err) = validate_options(&cwd, &options) {
        if let Some(root) = workspace::root(&cwd) {
            return workspace_command::execute_then(
                &root,
                args,
                "new",
                move |_| -> io::Result<Report> { Err(io::Error::other(err)) },
            );
        }
        return workspace_command::execute_without_loader_scope(
            &cwd,
            args,
            "new",
            move |_| -> io::Result<Report> { Err(io::Error::other(err)) },
        );
    }
    Ok(Outcome::Declined("new requires workspace-starter runtime".into()))
}

pub(super) fn validate_options(cwd: &Path, options: &Options) -> Result<(), String> {
    if workspace::root(cwd).is_some() {
        return Err(
            "Error: unable to generate a new workspace inside of an existing workspace".to_owned()
        );
    }
    let target_dir =
        if options.current_dir { cwd.to_path_buf() } else { cwd.join(&options.workspace_name) };
    if !options.current_dir && target_dir.exists() {
        return Err(format!(
            r#"unable to create a workspace at "{}", this path already exists"#,
            options.workspace_name,
        ));
    }
    validate_template_source(cwd, options)
}

fn validate_template_source(cwd: &Path, options: &Options) -> Result<(), String> {
    if let Some(load_from) = options.load_from.as_deref() {
        if options.aspect.is_none() {
            return Err(
                "to load a template from a different workspace, please provide the aspect-id using --aspect flag"
                    .to_owned(),
            );
        }
        let load_path = cwd.join(load_from);
        if workspace::root(&load_path).is_none_or(|root| root != load_path) {
            return Err(format!(
                r#"fatal: "{load_from}" is not a valid Bit workspace, make sure the path is correct"#,
            ));
        }
        return Ok(());
    }
    if options.aspect.is_none()
        && !BUILTIN_WORKSPACE_TEMPLATES.contains(&options.template_name.as_str())
    {
        return Err(format!(
            "template \"{}\" was not found, please use --aspect flag to load from an env i.e --aspect teambit.react/react-env\n Learn more about component templates here: https://bit.dev/reference/generator/create-generator",
            options.template_name,
        ));
    }
    Ok(())
}

pub(super) fn parse_options(args: &[&str]) -> Option<Options> {
    let mut positionals = Vec::new();
    let mut aspect = None;
    let mut load_from = None;
    let mut current_dir = false;
    let mut iter = args.iter().copied().peekable();
    while let Some(token) = iter.next() {
        if token == "--" {
            for item in iter {
                positionals.push(take_new_val(item)?);
            }
            break;
        }
        apply_new_token(
            token,
            &mut iter,
            &mut aspect,
            &mut load_from,
            &mut current_dir,
            &mut positionals,
        )?;
    }
    if positionals.len() != 2 {
        return None;
    }
    let workspace_name = positionals.pop()?;
    let template_name = positionals.pop()?;
    Some(Options { template_name, workspace_name, aspect, load_from, current_dir })
}

fn apply_new_token<'a>(
    token: &'a str,
    iter: &mut std::iter::Peekable<impl Iterator<Item = &'a str>>,
    aspect: &mut Option<String>,
    load_from: &mut Option<String>,
    current_dir: &mut bool,
    positionals: &mut Vec<String>,
) -> Option<()> {
    match token {
        "--no-color" | "--standalone" | "--standalone=true" | "--standalone=false"
        | "--skip-git" | "--skip-git=true" | "--skip-git=false" | "-s" | "--empty"
        | "--empty=true" | "--empty=false" | "-e" => {}
        "--current-dir" | "--current-dir=true" | "-c" => *current_dir = true,
        "--current-dir=false" => *current_dir = false,
        "--aspect" | "-a" | "--template" | "-t" | "--env" => {
            *aspect = Some(take_new_val(iter.next()?)?);
        }
        "--default-scope" | "-d" => {
            take_new_val(iter.next()?)?;
        }
        "--load-from" => *load_from = Some(take_new_val(iter.next()?)?),
        "--agent" => {
            if iter
                .peek()
                .is_some_and(|next| !next.starts_with('-'))
            {
                iter.next();
            }
        }
        _ => apply_inline_new_token(token, aspect, load_from, current_dir, positionals)?,
    }
    Some(())
}

fn apply_inline_new_token(
    token: &str,
    aspect: &mut Option<String>,
    load_from: &mut Option<String>,
    current_dir: &mut bool,
    positionals: &mut Vec<String>,
) -> Option<()> {
    if let Some(val) = token
        .strip_prefix("--aspect=")
        .or_else(|| token.strip_prefix("-a="))
        .or_else(|| token.strip_prefix("--template="))
        .or_else(|| token.strip_prefix("-t="))
        .or_else(|| token.strip_prefix("--env="))
    {
        *aspect = Some(take_new_val(val)?);
    } else if let Some(val) = token.strip_prefix("--load-from=") {
        *load_from = Some(take_new_val(val)?);
    } else if let Some(val) = token
        .strip_prefix("--default-scope=")
        .or_else(|| token.strip_prefix("-d="))
    {
        take_new_val(val)?;
    } else if token.starts_with("--agent=") {
    } else if token.starts_with('-') {
        apply_short_new_flags(token, current_dir)?;
    } else {
        positionals.push(take_new_val(token)?);
    }
    Some(())
}

fn apply_short_new_flags(token: &str, current_dir: &mut bool) -> Option<()> {
    let flags = token.strip_prefix('-')?;
    if flags.is_empty() || flags.starts_with('-') {
        return None;
    }
    for ch in flags.chars() {
        match ch {
            's' | 'e' => {}
            'c' => *current_dir = true,
            _ => return None,
        }
    }
    Some(())
}

fn take_new_val(val: &str) -> Option<String> {
    (!val.is_empty() && !val.starts_with('-')).then(|| val.to_owned())
}
