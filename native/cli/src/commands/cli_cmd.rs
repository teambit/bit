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
    if let Some(skill) = parse_unknown_skill(&argv[1..]) {
        if env::var_os("CI").is_some_and(|val| !val.is_empty()) {
            return Ok(Outcome::Declined("CI cli generate skill error delegated".into()));
        }
        return emit_unknown_skill(args, skill);
    }
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

fn emit_unknown_skill(args: &[OsString], skill: &str) -> io::Result<Outcome> {
    let msg = format!(r#"Unknown skill type: "{skill}". Use "commands" or "reference"."#);
    let err = io::Error::other(msg);
    let cwd = env::current_dir()?;
    if let Some(root) = workspace::root(&cwd) {
        return workspace_command::execute_without_loader(&root, args, "generate", |_| Err(err));
    }
    workspace_command::execute_failure_scope(&cwd, args, "generate", true, "", err)
}

pub(super) fn parse_unknown_skill<'a>(args: &[&'a str]) -> Option<&'a str> {
    let ["generate", rest @ ..] = args else { return None };
    if docs_enabled(rest) || !valid_docs_options(rest) {
        return None;
    }
    let mut skill = None;
    let mut index = 0;
    while index < rest.len() {
        match &rest[index..] {
            ["--skill" | "-s", value, ..] => {
                skill = Some(*value);
                index += 2;
            }
            [arg, ..]
                if let Some(val) = arg
                    .strip_prefix("--skill=")
                    .or_else(|| arg.strip_prefix("-s=")) =>
            {
                skill = Some(val);
                index += 1;
            }
            _ => index += 1,
        }
    }
    skill.filter(|val| *val != "commands" && *val != "reference")
}

pub(super) fn is_generate_docs(args: &[&str]) -> bool {
    let ["generate", rest @ ..] = args else { return false };
    docs_enabled(rest) && valid_docs_options(rest)
}

fn docs_enabled(rest: &[&str]) -> bool {
    let mut enabled = false;
    for &arg in rest {
        match arg {
            "-d" | "-dm" | "-md" | "--docs" | "--docs=true" => enabled = true,
            "--docs=false" => enabled = false,
            _ => {}
        }
    }
    enabled
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
        ["--"] => Some(1),
        ["--skill" | "-s", value, ..] if !value.starts_with('-') => Some(2),
        [
            "-d" | "-dm" | "-md" | "--docs" | "--docs=true" | "--docs=false" | "-m" | "--metadata"
            | "--metadata=true" | "--metadata=false" | "--no-color" | "--no-color=true"
            | "--no-color=false",
            ..,
        ] => Some(1),
        [arg, ..] if arg.starts_with("--metadata.") && arg.contains('=') => Some(1),
        [arg, ..]
            if let Some(val) = arg
                .strip_prefix("--skill=")
                .or_else(|| arg.strip_prefix("-s="))
                && !val.is_empty()
                && !val.starts_with('-') =>
        {
            Some(1)
        }
        _ => None,
    }
}

pub(super) fn render_docs_frontmatter(version: &str) -> String {
    format!(
        "---\ndescription: 'Bit command synopses. Bit version: {version}'\nlabels: ['cli', 'mdx', 'docs']\n---",
    )
}
