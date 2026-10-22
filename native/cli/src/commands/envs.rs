//! Native `bit envs <set|unset>` (`bit env <set|unset>`) (`scopes/workspace/workspace/envs-subcommands/`).

mod mutation;
#[cfg(test)]
mod tests;

use self::mutation::prepare;
use super::{
    Command, aspect::is_supported_pattern, color::Chalk, scope_set::Failure, workspace_command,
};
use crate::{native::Outcome, workspace};
use std::{env, ffi::OsString, io};

pub const COMMAND: Command = Command { name: "envs", aliases: &["env"], run };

pub(super) const CORE_ENVS: &[&str] = &[
    "teambit.harmony/aspect",
    "teambit.react/react",
    "teambit.harmony/node",
    "teambit.react/react-native",
    "teambit.html/html",
    "teambit.mdx/mdx",
    "teambit.envs/env",
    "teambit.mdx/readme",
    "teambit.harmony/bit-custom-aspect",
    "teambit.harmony/empty-env",
];

#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) enum Subcommand {
    Set { pattern: String, env: String },
    Unset { pattern: String },
    Replace { old_env: String, new_env: String },
}

fn run(args: &[OsString]) -> io::Result<Outcome> {
    let Some(argv) = workspace_command::utf8_args(args) else {
        return Ok(Outcome::Declined("envs arguments are not UTF-8".into()));
    };
    let Some(subcommand) = parse_subcommand(&argv[1..]) else {
        return Ok(Outcome::Declined("outside native envs grammar".into()));
    };
    let Some(root) = workspace::root(&env::current_dir()?) else {
        return Ok(Outcome::Declined("envs requires a workspace".into()));
    };
    let chalk = Chalk::detect(args);
    let label = subcommand.loader_label();
    match prepare(&root, &subcommand, chalk) {
        Ok(prepared) => {
            workspace_command::execute_then(&root, args, label, |_output| prepared.commit(chalk))
        }
        Err(Failure::User(message)) => {
            if env::var_os("CI").is_some_and(|value| !value.is_empty()) {
                return Ok(Outcome::Declined("CI envs error stack".into()));
            }
            workspace_command::execute_then(&root, args, label, |_output| {
                Err(io::Error::other(message))
            })
        }
        Err(Failure::Declined(reason)) => Ok(Outcome::Declined(format!("envs: {reason}"))),
    }
}

impl Subcommand {
    const fn loader_label(&self) -> &'static str {
        match self {
            Self::Set { .. } => "set",
            Self::Unset { .. } => "unset",
            Self::Replace { .. } => "replace",
        }
    }
}

pub(super) fn parse_subcommand(args: &[&str]) -> Option<Subcommand> {
    let filtered = args
        .iter()
        .copied()
        .filter(|arg| *arg != "--no-color")
        .collect::<Vec<_>>();
    match filtered.as_slice() {
        ["set", pattern, env]
            if is_supported_pattern(pattern) && !env.is_empty() && !env.starts_with('-') =>
        {
            Some(Subcommand::Set { pattern: (*pattern).to_owned(), env: (*env).to_owned() })
        }
        ["unset", pattern] if is_supported_pattern(pattern) => {
            Some(Subcommand::Unset { pattern: (*pattern).to_owned() })
        }
        ["replace", old_env, new_env]
            if !old_env.is_empty()
                && !old_env.starts_with('-')
                && !new_env.is_empty()
                && !new_env.starts_with('-') =>
        {
            Some(Subcommand::Replace {
                old_env: (*old_env).to_owned(),
                new_env: (*new_env).to_owned(),
            })
        }
        _ => None,
    }
}
