//! Native `bit npmrc` (`NpmrcCmd` in `scopes/cloud/cloud/npmrc.cmd.ts`).

#[cfg(test)]
mod tests;

use super::{Command, color::Chalk, workspace_command};
use crate::native::Outcome;
use std::{
    ffi::OsString,
    io::{self, Write},
    process::ExitCode,
};

pub const COMMAND: Command = Command { name: "npmrc", aliases: &[], run };

fn run(args: &[OsString]) -> io::Result<Outcome> {
    let Some(subcommand) = parse_subcommand(args) else {
        return Ok(Outcome::Declined("arguments outside the native `npmrc` grammar".to_owned()));
    };
    if subcommand == "generate" {
        return Ok(Outcome::Declined("npmrc generate requires canonical aspect".to_owned()));
    }
    let chalk = Chalk::detect(args);
    let output = workspace_command::loader_output(chalk, false);
    output.restart(r#"running command "npmrc"..."#);
    output.stop();
    let message = chalk.red(&format!(
        r#""{subcommand}" is not a subcommand of "npmrc", please run "bit npmrc --help" to list the subcommands"#,
    ));
    writeln!(io::stdout(), "{message}")?;
    Ok(Outcome::Exit(ExitCode::SUCCESS))
}

fn parse_subcommand(args: &[OsString]) -> Option<String> {
    let mut subcommand = None;
    for arg in args.iter().skip(1) {
        let str_arg = arg.to_str()?;
        if str_arg == "--no-color" {
            continue;
        }
        if str_arg.starts_with('-') {
            return None;
        }
        if subcommand.is_none() {
            subcommand = Some(str_arg.to_owned());
        } else {
            return None;
        }
    }
    subcommand
}
