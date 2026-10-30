//! Native `bit envs <list|get|set|unset|replace|update>` (`bit env ...`) (`scopes/envs/envs/envs.cmd.ts`).

mod inspect;
mod mutation;
#[cfg(test)]
mod tests;

use self::{
    inspect::{run_bare_scope_get, run_bare_scope_list, run_get, run_list},
    mutation::prepare,
};
use super::{
    Command, aspect::is_supported_pattern, color::Chalk, lane::scope_root, scope_set::Failure,
    workspace_command,
};
use crate::{native::Outcome, workspace};
use std::{env, ffi::OsString, io, path::Path};

pub const COMMAND: Command = Command { name: "envs", aliases: &["env"], run };

const WORKSPACE_NOT_FOUND_ERR: &str = "error: workspace not found";

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
    List { json: bool, table_only: bool },
    Get { component: String, services: Option<Vec<String>> },
    Set { pattern: String, env: String },
    Unset { pattern: String },
    Replace { old_env: String, new_env: String },
    Update { env_id: Option<String>, pattern: Option<String> },
}

fn run(args: &[OsString]) -> io::Result<Outcome> {
    let Some(argv) = workspace_command::utf8_args(args) else {
        return Ok(Outcome::Declined("envs arguments are not UTF-8".into()));
    };
    let Some(subcommand) = parse_subcommand(&argv[1..]) else {
        return Ok(Outcome::Declined("outside native envs grammar".into()));
    };
    let cwd = env::current_dir()?;
    let chalk = Chalk::detect(args);
    let Some(root) = workspace::root(&cwd) else {
        return run_without_workspace(&cwd, args, &subcommand, chalk);
    };
    run_in_workspace(&root, args, &subcommand, chalk)
}

fn run_without_workspace(
    cwd: &Path,
    args: &[OsString],
    subcommand: &Subcommand,
    chalk: Chalk,
) -> io::Result<Outcome> {
    if let Some(scope) = scope_root::discover().ok().flatten()
        && scope.bare
    {
        return run_bare_scope(&scope.path, args, subcommand, chalk);
    }
    if env::var_os("CI").is_some_and(|val| !val.is_empty()) {
        return Ok(Outcome::Declined("CI envs outside workspace delegated".into()));
    }
    let label = match subcommand {
        Subcommand::List { table_only: true, .. }
        | Subcommand::Set { .. }
        | Subcommand::Unset { .. }
        | Subcommand::Replace { .. }
        | Subcommand::Update { .. } => "envs",
        Subcommand::Get { .. } => "get",
        Subcommand::List { .. } => {
            return Ok(Outcome::Declined("envs requires a workspace".into()));
        }
    };
    workspace_command::execute_failure_scope(
        cwd,
        args,
        label,
        false,
        "",
        io::Error::other(WORKSPACE_NOT_FOUND_ERR),
    )
}

fn run_bare_scope(
    scope_path: &Path,
    args: &[OsString],
    subcommand: &Subcommand,
    chalk: Chalk,
) -> io::Result<Outcome> {
    match subcommand {
        Subcommand::List { table_only: true, .. }
        | Subcommand::Set { .. }
        | Subcommand::Unset { .. }
        | Subcommand::Replace { .. }
        | Subcommand::Update { .. } => run_bare_scope_list(scope_path, args, chalk),
        Subcommand::Get { component, services: None } => {
            run_bare_scope_get(scope_path, args, component, chalk)
        }
        _ => Ok(Outcome::Declined("envs bare-scope subcommand delegated".into())),
    }
}

fn run_in_workspace(
    root: &Path,
    args: &[OsString],
    subcommand: &Subcommand,
    chalk: Chalk,
) -> io::Result<Outcome> {
    match subcommand {
        Subcommand::List { json, table_only } => {
            return finish_outcome(
                root,
                args,
                "envs",
                run_list(root, args, *json, *table_only, chalk),
            );
        }
        Subcommand::Get { component, services } => {
            return finish_outcome(
                root,
                args,
                "get",
                run_get(root, args, component, services.as_deref(), chalk),
            );
        }
        Subcommand::Set { .. }
        | Subcommand::Unset { .. }
        | Subcommand::Replace { .. }
        | Subcommand::Update { .. } => {}
    }
    let label = subcommand.loader_label();
    let result = prepare(root, subcommand, chalk)
        .and_then(|prepared| {
            workspace_command::execute_then(root, args, label, |_output| prepared.commit(chalk))
                .map_err(|err| Failure::Declined(err.to_string()))
        });
    finish_outcome(root, args, label, result)
}

fn finish_outcome(
    root: &Path,
    args: &[OsString],
    label: &str,
    result: Result<Outcome, Failure>,
) -> io::Result<Outcome> {
    match result {
        Ok(outcome) => Ok(outcome),
        Err(Failure::User(message)) => {
            if env::var_os("CI").is_some_and(|value| !value.is_empty()) {
                return Ok(Outcome::Declined("CI envs error stack".into()));
            }
            workspace_command::execute_then(root, args, label, |_output| {
                Err(io::Error::other(message))
            })
        }
        Err(Failure::Declined(reason)) => Ok(Outcome::Declined(format!("envs: {reason}"))),
    }
}

impl Subcommand {
    const fn loader_label(&self) -> &'static str {
        match self {
            Self::List { .. } => "envs",
            Self::Get { .. } => "get",
            Self::Set { .. } => "set",
            Self::Unset { .. } => "unset",
            Self::Replace { .. } => "replace",
            Self::Update { .. } => "update",
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
        ["list", rest @ ..] => parse_list(rest, false),
        ["get", rest @ ..] => parse_get(rest),
        ["set", rest @ ..] => parse_set(rest),
        ["unset", rest @ ..] => parse_unset(rest),
        ["replace", rest @ ..] => parse_replace(rest),
        ["update", rest @ ..] => parse_update(rest),
        rest => parse_list(rest, true),
    }
}

fn parse_set(rest: &[&str]) -> Option<Subcommand> {
    let tokens = super::scope_set::collect_non_flag_tokens(rest)?;
    let [pattern, env] = tokens.as_slice() else { return None };
    (is_supported_pattern(pattern) && !env.is_empty()).then(|| Subcommand::Set {
        pattern: (*pattern).to_owned(),
        env: (*env).to_owned(),
    })
}

fn parse_unset(rest: &[&str]) -> Option<Subcommand> {
    let tokens = super::scope_set::collect_non_flag_tokens(rest)?;
    let [pattern] = tokens.as_slice() else { return None };
    is_supported_pattern(pattern).then(|| Subcommand::Unset { pattern: (*pattern).to_owned() })
}

fn parse_replace(rest: &[&str]) -> Option<Subcommand> {
    let tokens = super::scope_set::collect_non_flag_tokens(rest)?;
    let [old_env, new_env] = tokens.as_slice() else { return None };
    (!old_env.is_empty() && !new_env.is_empty()).then(|| Subcommand::Replace {
        old_env: (*old_env).to_owned(),
        new_env: (*new_env).to_owned(),
    })
}

fn parse_update(rest: &[&str]) -> Option<Subcommand> {
    let tokens = super::scope_set::collect_non_flag_tokens(rest)?;
    match tokens.as_slice() {
        [] => Some(Subcommand::Update { env_id: None, pattern: None }),
        [env_id] if is_valid_update_env_id(env_id) => {
            Some(Subcommand::Update { env_id: Some((*env_id).to_owned()), pattern: None })
        }
        [env_id, pattern] if is_valid_update_env_id(env_id) && is_supported_pattern(pattern) => {
            Some(Subcommand::Update {
                env_id: Some((*env_id).to_owned()),
                pattern: Some((*pattern).to_owned()),
            })
        }
        _ => None,
    }
}

fn is_valid_update_env_id(env_id: &str) -> bool {
    let bare = env_id
        .split('@')
        .next()
        .unwrap_or(env_id);
    !bare.is_empty() && !env_id.starts_with('-') && is_supported_pattern(bare)
}

fn parse_list(rest: &[&str], table_only: bool) -> Option<Subcommand> {
    let mut json = false;
    let mut iter = rest.iter().copied();
    while let Some(arg) = iter.next() {
        match arg {
            "--" => {
                return iter
                    .next()
                    .is_none()
                    .then_some(Subcommand::List { json, table_only });
            }
            "-j" | "--json" | "--json=true" => json = true,
            "--json=false" => json = false,
            _ => return None,
        }
    }
    Some(Subcommand::List { json, table_only })
}

fn parse_get(rest: &[&str]) -> Option<Subcommand> {
    let mut component = None;
    let mut services = None;
    let mut idx = 0usize;
    while idx < rest.len() {
        match rest[idx] {
            "--" => {
                consume_trailing_env_comp(&rest[idx + 1..], &mut component)?;
                break;
            }
            "--services" => {
                idx += 1;
                services = Some(parse_services_val(rest.get(idx)?)?);
            }
            arg if let Some(val) = arg.strip_prefix("--services=") => {
                services = Some(parse_services_val(val)?);
            }
            val if !val.starts_with('-') && !val.is_empty() && component.is_none() => {
                component = Some(val.to_owned());
            }
            _ => return None,
        }
        idx += 1;
    }
    Some(Subcommand::Get { component: component?, services })
}

fn consume_trailing_env_comp(rest: &[&str], component: &mut Option<String>) -> Option<()> {
    super::lint_cmd::consume_trailing_internalize(rest.iter().copied(), component)
}

fn parse_services_val(val: &str) -> Option<Vec<String>> {
    if val.is_empty() || val.starts_with('-') {
        return None;
    }
    let items: Vec<String> = val
        .split(',')
        .map(str::trim)
        .filter(|item| !item.is_empty())
        .map(str::to_owned)
        .collect();
    (!items.is_empty()).then_some(items)
}
