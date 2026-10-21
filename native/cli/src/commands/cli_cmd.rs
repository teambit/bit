//! Native `bit cli generate --docs` (`scopes/harmony/cli/cli.cmd.ts`).

#[cfg(test)]
mod tests;

use super::{
    Command,
    workspace_command::{self, NodeCli},
};
use crate::{history::History, native::Outcome, workspace};
use std::{
    env,
    ffi::OsString,
    io::{self, Write},
    process::ExitCode,
};

pub const COMMAND: Command = Command { name: "cli", aliases: &[], run };

fn run(args: &[OsString]) -> io::Result<Outcome> {
    let Some(argv) = workspace_command::utf8_args(args) else {
        return Ok(Outcome::Declined("cli arguments are not UTF-8".into()));
    };
    if !is_generate_docs(&argv[1..]) {
        return Ok(Outcome::Declined("outside native cli generate --docs grammar".into()));
    }
    let Ok(cli) = NodeCli::find() else {
        return Ok(Outcome::Declined("unable to locate Bit CLI package version".into()));
    };
    if cli.version.is_empty() {
        return Ok(Outcome::Declined("empty Bit CLI version".into()));
    }
    let history = workspace::root(&env::current_dir()?).map(|root| History::start(&root, args));
    let mut stdout = io::stdout().lock();
    writeln!(stdout, "{}", render_docs_frontmatter(&cli.version))?;
    stdout.flush()?;
    if let Some(history) = history {
        history.end(true);
    }
    Ok(Outcome::Exit(ExitCode::SUCCESS))
}

pub(super) fn is_generate_docs(args: &[&str]) -> bool {
    let filtered = args
        .iter()
        .copied()
        .filter(|arg| *arg != "--no-color")
        .collect::<Vec<_>>();
    matches!(filtered.as_slice(), ["generate", "--docs"])
}

pub(super) fn render_docs_frontmatter(version: &str) -> String {
    format!(
        "---\ndescription: 'Bit command synopses. Bit version: {version}'\nlabels: ['cli', 'mdx', 'docs']\n---",
    )
}
