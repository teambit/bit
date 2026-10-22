//! Native `bit graph [id]` (`scopes/component/graph/graph-cmd.ts`).

#[cfg(test)]
mod tests;

use super::{Command, workspace_command};
use crate::{native::Outcome, workspace};
use std::{env, ffi::OsString, io, path::Path};

pub const COMMAND: Command = Command { name: "graph", aliases: &[], run };

const MISSING_REMOTE_OR_ID_ERR: &str = "please specify remote scope name or enter an id";
const HOST_NOT_FOUND_ERR: &str = "Host was not found";

#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub(super) struct Options {
    pub id: Option<String>,
    pub remote: Option<String>,
    pub layout: Option<String>,
    pub png: bool,
    pub cycles: bool,
    pub include_local_only: bool,
    pub include_dependencies: bool,
    pub json: bool,
}

fn run(args: &[OsString]) -> io::Result<Outcome> {
    let Some(argv) = workspace_command::utf8_args(args) else {
        return Ok(Outcome::Declined("graph arguments are not UTF-8".into()));
    };
    let Some(options) = parse_options(&argv[1..]) else {
        return Ok(Outcome::Declined("outside native graph grammar".into()));
    };
    if env::var_os("CI").is_some_and(|val| !val.is_empty()) {
        return Ok(Outcome::Declined("CI graph delegated".into()));
    }
    let cwd = env::current_dir()?;
    if let Some(err) = fast_graph_error(&cwd, &options) {
        if let Some(root) = workspace::root(&cwd) {
            return workspace_command::execute_without_loader(&root, args, "graph", |_| {
                Err(io::Error::other(err))
            });
        }
        return workspace_command::execute_without_loader_scope(&cwd, args, "graph", |_| {
            Err(io::Error::other(err))
        });
    }
    Ok(Outcome::Declined("graph generation delegated".into()))
}

pub(super) fn fast_graph_error(cwd: &Path, options: &Options) -> Option<&'static str> {
    if let Some(remote_name) = &options.remote {
        if remote_name.is_empty() && options.id.is_none() {
            return Some(MISSING_REMOTE_OR_ID_ERR);
        }
        return None;
    }
    if workspace::root(cwd).is_none()
        && !cwd.join("scope.json").is_file()
        && !cwd.join(".bit").is_dir()
    {
        return Some(HOST_NOT_FOUND_ERR);
    }
    None
}

pub(super) fn parse_options(args: &[&str]) -> Option<Options> {
    let mut options = Options::default();
    let mut idx = 0;
    while idx < args.len() {
        apply_token(args, &mut idx, &mut options)?;
        idx += 1;
    }
    Some(options)
}

fn apply_token(args: &[&str], idx: &mut usize, options: &mut Options) -> Option<()> {
    let arg = args[*idx];
    match arg {
        "--no-color" => {}
        "--png" => options.png = true,
        "--cycles" => options.cycles = true,
        "--include-local-only" => options.include_local_only = true,
        "--include-dependencies" => options.include_dependencies = true,
        "-j" | "--json" => options.json = true,
        "-r" | "--remote" => options.remote = Some(take_optional_remote(args, idx)),
        "--layout" => options.layout = Some(take_required_layout(args, idx)?),
        _ => apply_inline_or_id(arg, options)?,
    }
    Some(())
}

fn take_optional_remote(args: &[&str], idx: &mut usize) -> String {
    if let Some(&next) = args.get(*idx + 1)
        && !next.starts_with('-')
    {
        *idx += 1;
        next.to_owned()
    } else {
        String::new()
    }
}

fn take_required_layout(args: &[&str], idx: &mut usize) -> Option<String> {
    let next = *args.get(*idx + 1)?;
    if next.is_empty() || next.starts_with('-') {
        return None;
    }
    *idx += 1;
    Some(next.to_owned())
}

fn apply_inline_or_id(arg: &str, options: &mut Options) -> Option<()> {
    if let Some(val) = arg.strip_prefix("--remote=") {
        options.remote = Some(val.to_owned());
    } else if let Some(val) = arg.strip_prefix("--layout=") {
        (!val.is_empty()).then_some(())?;
        options.layout = Some(val.to_owned());
    } else if !arg.starts_with('-') && !arg.is_empty() && options.id.is_none() {
        options.id = Some(arg.to_owned());
    } else {
        return None;
    }
    Some(())
}
