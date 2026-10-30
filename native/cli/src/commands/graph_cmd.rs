//! Native `bit graph [id]` (`scopes/component/graph/graph-cmd.ts`).

pub(super) mod builder;
pub(super) mod model;
pub(super) mod scope;
#[cfg(test)]
mod tests;

use self::{builder::execute_workspace_graph, scope::execute_scope_graph};
use super::{
    Command,
    color::Chalk,
    lane::scope_root,
    scope_set::Failure,
    workspace_command::{self, format::Formatter, results::Report},
};
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
        return emit_fast_graph_error(&cwd, args, err);
    }
    if options.remote.is_some() || options.png {
        return Ok(Outcome::Declined("remote/png graph delegated".into()));
    }
    if let Some(root) = workspace::root(&cwd) {
        return finish_graph(&root, args, &options);
    }
    if let Some(scope) = scope_root::discover().ok().flatten()
        && scope.bare
    {
        return finish_scope_graph(&scope.path, args, &options);
    }
    Ok(Outcome::Declined("bare scope graph delegated".into()))
}

fn emit_fast_graph_error(cwd: &Path, args: &[OsString], err: &'static str) -> io::Result<Outcome> {
    if let Some(root) = workspace::root(cwd) {
        return workspace_command::execute_without_loader(&root, args, "graph", |_| {
            Err(io::Error::other(err))
        });
    }
    workspace_command::execute_without_loader_scope(cwd, args, "graph", |_| {
        Err(io::Error::other(err))
    })
}

fn finish_graph(root: &Path, args: &[OsString], options: &Options) -> io::Result<Outcome> {
    let formatter = Formatter::new(Chalk::detect(args));
    match execute_workspace_graph(root, options, &formatter) {
        Ok(data) if options.json => {
            workspace_command::execute_json(root, args, "graph", move |_| {
                Ok(Report { data, code: 0, details: None })
            })
        }
        Ok(data) => workspace_command::execute_then(root, args, "graph", move |_| {
            Ok(Report { data, code: 0, details: None })
        }),
        Err(Failure::User(message)) if options.json => {
            workspace_command::execute_json(root, args, "graph", move |_| {
                Err(io::Error::other(message))
            })
        }
        Err(Failure::User(message)) => {
            workspace_command::execute_then(root, args, "graph", move |_| {
                Err(io::Error::other(message))
            })
        }
        Err(Failure::Declined(reason)) => Ok(Outcome::Declined(format!("graph: {reason}"))),
    }
}

fn finish_scope_graph(scope: &Path, args: &[OsString], options: &Options) -> io::Result<Outcome> {
    let formatter = Formatter::new(Chalk::detect(args));
    match execute_scope_graph(scope, options, &formatter) {
        Ok(data) if options.json => {
            workspace_command::execute_json_scope(scope, args, "graph", move |_| {
                Ok(Report { data, code: 0, details: None })
            })
        }
        Ok(data) => workspace_command::execute_then_scope(scope, args, "graph", move |_| {
            Ok(Report { data, code: 0, details: None })
        }),
        Err(Failure::User(message)) if options.json => {
            workspace_command::execute_json_scope(scope, args, "graph", move |_| {
                Err(io::Error::other(message))
            })
        }
        Err(Failure::User(message)) => {
            workspace_command::execute_then_scope(scope, args, "graph", move |_| {
                Err(io::Error::other(message))
            })
        }
        Err(Failure::Declined(reason)) => Ok(Outcome::Declined(format!("graph: {reason}"))),
    }
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
        "--png" | "--png=true" => options.png = true,
        "--png=false" => options.png = false,
        "--cycles" | "--cycles=true" => options.cycles = true,
        "--cycles=false" => options.cycles = false,
        "--include-local-only" | "--include-local-only=true" => options.include_local_only = true,
        "--include-local-only=false" => options.include_local_only = false,
        "--include-dependencies" | "--include-dependencies=true" => {
            options.include_dependencies = true;
        }
        "--include-dependencies=false" => options.include_dependencies = false,
        "-j" | "--json" | "--json=true" => options.json = true,
        "--json=false" => options.json = false,
        "-r" | "--remote" => options.remote = Some(take_optional_remote(args, idx)),
        "-rj" => {
            options.remote = Some(String::new());
            options.json = true;
        }
        "-jr" => {
            options.remote = Some(take_optional_remote(args, idx));
            options.json = true;
        }
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
    if let Some(val) = arg
        .strip_prefix("--remote=")
        .or_else(|| arg.strip_prefix("-r="))
    {
        options.remote = Some(val.to_owned());
    } else if let Some(val) = arg.strip_prefix("--layout=") {
        (!val.is_empty() && !val.starts_with('-')).then_some(())?;
        options.layout = Some(val.to_owned());
    } else if !arg.starts_with('-') && !arg.is_empty() && options.id.is_none() {
        options.id = Some(arg.to_owned());
    } else {
        return None;
    }
    Some(())
}
