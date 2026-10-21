//! Native `bit ws-config <sub-command>` (`bit workspace-config`) (`scopes/workspace/workspace-config-files/ws-config.cmd.ts`).

#[cfg(test)]
mod tests;

use super::{
    Command,
    color::Chalk,
    lane::scope_root,
    workspace_command::{self, results::Report},
};
use crate::native::Outcome;
use std::{
    ffi::OsString,
    io::{self, Write},
    process::ExitCode,
};

pub const COMMAND: Command = Command { name: "ws-config", aliases: &["workspace-config"], run };

fn run(args: &[OsString]) -> io::Result<Outcome> {
    let Some(argv) = workspace_command::utf8_args(args) else {
        return Ok(Outcome::Declined("ws-config arguments are not UTF-8".into()));
    };
    let Some(sub) = parse_unrecognized(&argv[1..]) else {
        return Ok(Outcome::Declined("outside native ws-config grammar".into()));
    };
    let chalk = Chalk::detect(args);
    let data = chalk.red(&format!(
        r#""{sub}" is not a subcommand of "ws-config", please run "bit ws-config --help" to list the subcommands"#,
    ));
    let report = Report { data, code: 0, details: None };
    match scope_root::discover().ok().flatten() {
        Some(root) if !root.bare => {
            workspace_command::execute_then(&root.path, args, "ws-config", |_| Ok(report))
        }
        Some(root) => workspace_command::execute_with_scope(&root.path, args, "ws-config", &report),
        None => {
            let mut stdout = io::stdout().lock();
            writeln!(stdout, "{}", report.data)?;
            stdout.flush()?;
            Ok(Outcome::Exit(ExitCode::SUCCESS))
        }
    }
}

pub(super) fn parse_unrecognized<'a>(args: &[&'a str]) -> Option<&'a str> {
    let filtered = args
        .iter()
        .copied()
        .filter(|arg| *arg != "--no-color")
        .collect::<Vec<_>>();
    let [sub] = filtered.as_slice() else {
        return None;
    };
    (!sub.starts_with('-') && !matches!(*sub, "write" | "clean" | "list")).then_some(*sub)
}
