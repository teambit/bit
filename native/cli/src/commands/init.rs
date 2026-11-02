//! Native `InitCmd`: provision and repair the workspace/scope filesystem.
//!
//! Orchestrates [`COMMAND`], [`options`], [`plan`], [`workspace`], [`scope`], [`index`], [`assets`], and [`apply`].
mod apply;
mod assets;
mod config;
mod index;
mod options;
mod package;
mod plan;
mod scope;
mod workspace;

use super::{
    Command,
    color::Chalk,
    workspace_command::{self, format::Formatter},
};
use crate::native::Outcome;
use std::{
    ffi::OsString,
    io::{self, Write},
    process::ExitCode,
};

/// Descriptor for the `bit init` CLI command.
pub const COMMAND: Command = Command { name: "init", aliases: &[], run };

/// Entry point for `bit init` that validates flags, prepares the provisioning plan, and executes it.
fn run(args: &[OsString]) -> io::Result<Outcome> {
    let Some(mut options) = options::parse(args) else {
        return Ok(Outcome::Declined("init arguments outside native grammar".to_owned()));
    };
    if let Err(error) = defaults(&mut options) {
        return Ok(Outcome::Declined(format!("init global configuration: {error}")));
    }
    if let Some(error) = validation_error(&options) {
        return failure(args, &error);
    }
    let prepared = plan::prepare(&options)
        .map(|plan| {
            let assets = assets::Assets::prepare(&plan, &options);
            (plan, assets)
        });
    let (plan, assets) = match prepared {
        Ok(prepared) => prepared,
        Err(error) if error.to_string().starts_with("error: unable to init a bit workspace") => {
            return failure(args, &error.to_string());
        }
        Err(error) => return Ok(Outcome::Declined(format!("init: {error}"))),
    };
    execute(args, &options, plan, assets)
}

/// Applies `plan` and `assets` to disk and prints the `bit init` terminal summary.
fn execute(
    args: &[OsString],
    options: &options::Options,
    plan: plan::Plan,
    assets: io::Result<assets::Assets>,
) -> io::Result<Outcome> {
    let chalk = Chalk::detect(args);
    let output = workspace_command::loader_output(chalk, false);
    output.restart(r#"running command "init"..."#);
    let warning = plan.warning.trim();
    if !warning.is_empty() {
        output.console(warning);
    }
    let root = plan.root.clone();
    let created = plan.created;
    if let Err(error) = apply::apply(plan) {
        output.stop();
        eprintln!("{}", chalk.red(&error.to_string()));
        return Ok(Outcome::Exit(ExitCode::FAILURE));
    }
    let files = match assets {
        Ok(assets) => assets.write(&root),
        Err(error) => {
            output.stop();
            eprintln!("{}", chalk.red(&error.to_string()));
            return Ok(Outcome::Exit(ExitCode::FAILURE));
        }
    };
    output.stop();
    let message = report(options, created, files, chalk);
    writeln!(io::stdout(), "{message}")?;
    Ok(Outcome::Exit(ExitCode::SUCCESS))
}

/// Formats the human-readable `bit init` completion message for `options`, `created`, and optional `files`.
fn report(
    options: &options::Options,
    created: bool,
    files: (Option<String>, Option<String>),
    chalk: Chalk,
) -> String {
    let format = Formatter::new(chalk);
    if options.bare.is_some() {
        return format.success_summary("initialized an empty bare bit scope.");
    }
    let mut message = if options.resets.scope {
        format.hint("your local scope has been reset successfully.")
    } else if options.resets.hard {
        format.hint("your bit workspace has been hard-reset successfully.")
    } else if options.resets.repair {
        format.hint("your bit workspace has been reset successfully.")
    } else if created {
        format.success_summary("initialized a bit workspace.")
    } else {
        format.hint("successfully re-initialized a bit workspace.")
    };
    for (file, description) in [
        (files.0, "instructions for AI agents working in this workspace"),
        (files.1, "Bit Cloud MCP for AI agents (picked up by Claude Code, Visual Studio)"),
    ] {
        if let Some(file) = file
            .as_deref()
            .map(str::trim)
            .filter(|file| !file.is_empty())
        {
            message.push_str(&format.hint(&format!(
                "\n  Created {} — {description}",
                chalk.cyan(file),
            )));
        }
    }
    message
}

#[inline]
fn defaults(options: &mut options::Options) -> io::Result<()> {
    let global =
        bit_workspace_config::read_global_config(&bit_workspace_config::global_config_dir())?;
    for (key, target) in [
        ("default_scope", &mut options.defaults.scope),
        ("default_directory", &mut options.defaults.directory),
    ] {
        if target.is_none() {
            *target = default_option_value(&global, key);
        }
    }
    Ok(())
}

#[inline]
fn default_option_value(global: &serde_json::Value, key: &str) -> Option<String> {
    let clean = |raw: &str| {
        let trimmed = raw
            .trim()
            .trim_matches(['"', '\''])
            .trim();
        (!trimmed.is_empty()).then(|| trimmed.to_owned())
    };
    bit_workspace_config::environment_value(key)
        .and_then(|val| clean(&val))
        .or_else(|| global[key].as_str().and_then(clean))
}

#[inline]
fn failure(args: &[OsString], error: &str) -> io::Result<Outcome> {
    let chalk = Chalk::detect(args);
    let output = workspace_command::loader_output(chalk, false);
    output.restart(r#"running command "init"..."#);
    output.stop();
    eprintln!("{}", chalk.red(error.trim()));
    Ok(Outcome::Exit(ExitCode::FAILURE))
}

#[inline]
fn validation_error(options: &options::Options) -> Option<String> {
    if options.bare.is_some() {
        return (options.resets.repair || options.resets.hard).then(|| {
            "--reset and --reset-hard flags are not available for bare scope".to_owned()
        });
    }
    if options.resets.repair && options.resets.hard {
        return Some(
            "cannot use both --reset and --reset-hard, please use only one of them".to_owned(),
        );
    }
    let name = options.defaults.scope
        .as_deref()
        .map(str::trim)
        .filter(|name| !name.is_empty())?;
    let valid = match name.split_once('.') {
        Some((owner, scope)) => {
            !scope.contains('.') && valid_scope_part(owner) && valid_scope_part(scope)
        }
        None => name.len() >= 2 && valid_scope_part(name),
    };
    (!valid).then(|| format!(r#"error: "{name}" is invalid, component scope names can only contain alphanumeric, lowercase characters, and the following ["-", "_", "$", "!"]"#))
}

#[inline]
fn valid_scope_part(part: &str) -> bool {
    !part.is_empty()
        && part
            .bytes()
            .all(|byte| {
                byte.is_ascii_lowercase() || byte.is_ascii_digit() || b"$_-!".contains(&byte)
            })
}
