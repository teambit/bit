//! Native `bit remote` (`bit remote`, `bit remote list`, `bit remote add`, `bit remote del`).

mod options;
mod stores;

use crate::{
    commands::{Command, color::Chalk, workspace_command},
    history::History,
    native::Outcome,
    workspace,
};
use options::Options;
use std::{
    env,
    ffi::OsString,
    io::{self, Write},
    process::ExitCode,
};
use stores::Failure;

pub const COMMAND: Command = Command { name: "remote", aliases: &[], run };

fn run(args: &[OsString]) -> io::Result<Outcome> {
    let Some(options) = Options::parse(args) else {
        return Ok(Outcome::Declined("arguments outside the native `remote` grammar".to_owned()));
    };
    let cwd = env::current_dir()?;
    let root = workspace::root(&cwd);
    if let Some(root) = &root
        && invalid_workspace_config(root)
    {
        return Ok(Outcome::Declined("invalid workspace configuration".to_owned()));
    }
    let chalk = Chalk::detect(args);
    match stores::prepare(&options, args) {
        Ok(prepared) => execute(root.as_deref(), args, options.command, chalk, &prepared),
        Err(Failure::Declined(reason)) => Ok(Outcome::Declined(format!("remote: {reason}"))),
        Err(Failure::User(message)) => {
            if env::var_os("CI").is_some_and(|value| !value.is_empty()) {
                return Ok(Outcome::Declined("CI remote error stack".to_owned()));
            }
            execute_error(root.as_deref(), args, options.command, chalk, &message)
        }
    }
}

fn invalid_workspace_config(root: &std::path::Path) -> bool {
    let Ok(bytes) = std::fs::read(root.join("workspace.jsonc")) else {
        return true;
    };
    let Ok(config) = bit_workspace_config::parse_jsonc(&bytes) else {
        return true;
    };
    super::aspect::workspace_default_scope(&config).is_err()
}

fn execute(
    root: Option<&std::path::Path>,
    args: &[OsString],
    command: &str,
    chalk: Chalk,
    prepared: &stores::Prepared,
) -> io::Result<Outcome> {
    let history = root.map(|root| History::start(root, args));
    let output = workspace_command::loader_output(chalk, false);
    output.restart(&format!(r#"running command "{command}"..."#));
    let committed = prepared.commit();
    output.stop();
    match committed {
        Ok(()) => {
            writeln!(io::stdout().lock(), "{}", prepared.report)?;
            if let Some(history) = history {
                history.end(true);
            }
            Ok(Outcome::Exit(ExitCode::SUCCESS))
        }
        Err(error) => {
            if let Some(history) = history {
                history.end(false);
            }
            writeln!(io::stderr().lock(), "{}", chalk.red(&error.to_string()))?;
            Ok(Outcome::Exit(ExitCode::FAILURE))
        }
    }
}

fn execute_error(
    root: Option<&std::path::Path>,
    args: &[OsString],
    command: &str,
    chalk: Chalk,
    message: &str,
) -> io::Result<Outcome> {
    let history = root.map(|root| History::start(root, args));
    let output = workspace_command::loader_output(chalk, false);
    output.restart(&format!(r#"running command "{command}"..."#));
    output.stop();
    if let Some(history) = history {
        history.end(false);
    }
    writeln!(io::stderr().lock(), "{}", chalk.red(message))?;
    Ok(Outcome::Exit(ExitCode::FAILURE))
}

#[cfg(test)]
mod tests;
