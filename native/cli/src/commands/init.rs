//! Native `InitCmd`: provision and repair the workspace/scope filesystem.
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

pub const COMMAND: Command = Command { name: "init", aliases: &[], run };

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
        Err(error) => return Ok(Outcome::Declined(format!("init: {error}"))),
    };
    execute(args, &options, plan, assets)
}

fn execute(
    args: &[OsString],
    options: &options::Options,
    plan: plan::Plan,
    assets: io::Result<assets::Assets>,
) -> io::Result<Outcome> {
    let chalk = Chalk::detect(args);
    let output = workspace_command::loader_output(chalk, false);
    output.restart(r#"running command "init"..."#);
    if !plan.warning.is_empty() {
        output.console(&plan.warning);
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
        if let Some(file) = file {
            message.push_str(&format.hint(&format!(
                "\n  Created {} — {description}",
                chalk.cyan(&file),
            )));
        }
    }
    message
}

fn defaults(options: &mut options::Options) -> io::Result<()> {
    let global =
        bit_workspace_config::read_global_config(&bit_workspace_config::global_config_dir())?;
    for (key, target) in [
        ("default_scope", &mut options.defaults.scope),
        ("default_directory", &mut options.defaults.directory),
    ] {
        if target.is_none() {
            *target = bit_workspace_config::environment_value(key)
                .or_else(|| global[key].as_str().map(str::to_owned));
        }
    }
    Ok(())
}

fn failure(args: &[OsString], error: &str) -> io::Result<Outcome> {
    let chalk = Chalk::detect(args);
    let output = workspace_command::loader_output(chalk, false);
    output.restart(r#"running command "init"..."#);
    output.stop();
    eprintln!("{}", chalk.red(error));
    Ok(Outcome::Exit(ExitCode::FAILURE))
}

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
    let name = options.defaults.scope.as_deref()?;
    let parts: Vec<_> = name.split('.').collect();
    let valid = parts.len() <= 2
        && parts
            .iter()
            .all(|part| {
                !part.is_empty()
                    && part
                        .bytes()
                        .all(|byte| {
                            byte.is_ascii_lowercase()
                                || byte.is_ascii_digit()
                                || b"$_-!".contains(&byte)
                        })
            })
        && (parts.len() == 2 || name.len() >= 2);
    (!valid).then(|| format!(r#"error: "{name}" is invalid, component scope names can only contain alphanumeric, lowercase characters, and the following ["-", "_", "$", "!"]"#))
}
