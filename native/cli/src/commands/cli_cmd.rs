//! Native `bit cli generate --docs` with metadata and skill options (`cli.cmd.ts`).

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
    let ["generate", rest @ ..] = args else { return false };
    rest.contains(&"--docs") && valid_docs_options(rest)
}

fn valid_docs_options(rest: &[&str]) -> bool {
    let mut index = 0;
    while index < rest.len() {
        let Some(consumed) = docs_option_len(&rest[index..]) else { return false };
        index += consumed;
    }
    true
}

fn docs_option_len(rest: &[&str]) -> Option<usize> {
    match rest {
        ["--skill", value, ..] if !value.starts_with('-') => Some(2),
        ["--docs" | "--metadata" | "--no-color", ..] => Some(1),
        [arg, ..] if arg.starts_with("--metadata.") && arg.contains('=') => Some(1),
        [arg, ..] if arg.starts_with("--skill=") && arg.len() > "--skill=".len() => Some(1),
        _ => None,
    }
}

pub(super) fn render_docs_frontmatter(version: &str) -> String {
    format!(
        "---\ndescription: 'Bit command synopses. Bit version: {version}'\nlabels: ['cli', 'mdx', 'docs']\n---",
    )
}
