//! Native `bit deps <set|remove|unset|reset|eject|get|usage|diagnose|blame|write|circular>` (`bit dependencies`)
//! (`scopes/dependencies/dependencies/dependencies-cmd.ts`).

pub(super) use self::{
    mutation::{BitmapMutation, apply_dep_resolver_config},
    parse::{parse_subcommand, parse_why},
};

mod blame;
mod debug;
mod diagnose;
mod get;
mod mutation;
mod parse;
mod policy;
mod remove;
mod resolve;
#[cfg(test)]
mod tests;
mod usage;
mod usage_render;
mod write;

use self::{
    get::prepare_get,
    mutation::{
        ListActionSpec, SetSpec, commit_list_action, commit_set, prepare_list_action, prepare_set,
    },
    remove::{RemoveSpec, RemovedByComp, prepare_remove, render_remove},
    usage::prepare_usage,
    write::{WriteTarget, commit_write, prepare_write},
};
use super::{
    Command,
    color::Chalk,
    insights,
    lane::scope_root,
    scope_set::Failure,
    workspace_command::{self, format::Formatter, results::Report},
};
use crate::{native::Outcome, workspace};
use bit_install::workspace::Bitmap;
use serde_json::{Map, Value, json};
use std::{
    env,
    ffi::OsString,
    io::{self, Write},
    path::{Path, PathBuf},
    process::ExitCode,
};

pub const COMMAND: Command = Command { name: "deps", aliases: &["dependencies"], run };
pub const WHY: Command = Command { name: "why", aliases: &[], run: run_why };

const OUTSIDE_WORKSPACE_ERR: &str = "This command can only be run inside a bit workspace. Create a new workspace using 'bit new <template> <workspace-name>' or navigate to an existing workspace directory.";

#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) enum Subcommand {
    Set { pattern: String, packages: Vec<(String, String)>, dev: bool, optional: bool, peer: bool },
    Remove { pattern: String, packages: Vec<String>, dev: bool, peer: bool },
    Unset { pattern: String, packages: Vec<String>, dev: bool, peer: bool },
    Reset { pattern: String },
    Eject { pattern: String },
    Get { id: String, tree: bool, scope: bool },
    Debug { id: String },
    Usage { dep_name: String, depth: Option<usize> },
    Why { dep_name: String, depth: Option<usize> },
    Blame { component: String, dep: String },
    Diagnose { origins: bool },
    DiagnosePackage { package: String },
    Circular { json: bool, include_deps: bool },
    Write { target: WriteTarget },
    Unrecognized(String),
}

enum Prepared {
    Set { mutation: BitmapMutation, changed_comps: Vec<String>, added_packages: Value },
    Remove { mutation: BitmapMutation, removed: RemovedByComp, unset: bool },
    ListAction { mutation: BitmapMutation, summary: &'static str, comps: Vec<String> },
    ReadOnly(String),
    Write { root: PathBuf, target: WriteTarget, dependencies: Map<String, Value> },
}

impl Subcommand {
    const fn loader_label(&self) -> &'static str {
        match self {
            Self::Set { .. } => "set",
            Self::Remove { .. } => "remove",
            Self::Unset { .. } => "unset",
            Self::Reset { .. } => "reset",
            Self::Eject { .. } => "eject",
            Self::Get { .. } => "get",
            Self::Debug { .. } => "debug",
            Self::Usage { .. } => "usage",
            Self::Why { .. } => "why",
            Self::Blame { .. } => "blame",
            Self::Diagnose { .. } => "diagnose",
            Self::DiagnosePackage { .. } => "diagnose",
            Self::Circular { .. } => "circular",
            Self::Write { .. } => "write",
            Self::Unrecognized(_) => "deps",
        }
    }
}

fn run(args: &[OsString]) -> io::Result<Outcome> {
    let Some(argv) = workspace_command::utf8_args(args) else {
        return Ok(Outcome::Declined("deps arguments are not UTF-8".into()));
    };
    let Some(subcommand) = parse_subcommand(&argv[1..]) else {
        return Ok(Outcome::Declined("outside native deps grammar".into()));
    };
    let chalk = Chalk::detect(args);
    if let Subcommand::Unrecognized(sub) = &subcommand {
        return run_unrecognized(args, sub, chalk);
    }
    let cwd = env::current_dir()?;
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
    if let Subcommand::Get { id, tree, .. } = subcommand
        && let Some(scope) = scope_root::discover().ok().flatten()
        && scope.bare
    {
        return get::run_bare_scope(&scope, args, id, *tree, chalk);
    }
    if env::var_os("CI").is_some_and(|val| !val.is_empty()) {
        return Ok(Outcome::Declined("CI deps outside workspace delegated".into()));
    }
    let Some((json, msg)) = outside_workspace_failure(subcommand) else {
        return Ok(Outcome::Declined("deps requires a workspace".into()));
    };
    workspace_command::execute_failure_scope(
        cwd,
        args,
        subcommand.loader_label(),
        json,
        "",
        io::Error::other(msg),
    )
}

fn outside_workspace_failure(subcommand: &Subcommand) -> Option<(bool, &'static str)> {
    match subcommand {
        Subcommand::Debug { .. }
        | Subcommand::Usage { .. }
        | Subcommand::Why { .. }
        | Subcommand::Diagnose { .. }
        | Subcommand::DiagnosePackage { .. } => Some((false, OUTSIDE_WORKSPACE_ERR)),
        Subcommand::Circular { json, .. } => Some((*json, OUTSIDE_WORKSPACE_ERR)),
        Subcommand::Set { .. }
        | Subcommand::Remove { .. }
        | Subcommand::Unset { .. }
        | Subcommand::Reset { .. }
        | Subcommand::Eject { .. } => {
            Some((false, "Cannot read properties of undefined (reading 'idsByPattern')"))
        }
        Subcommand::Blame { .. } | Subcommand::Get { .. } => {
            Some((false, "Cannot read properties of undefined (reading 'resolveComponentId')"))
        }
        Subcommand::Write { .. } => {
            Some((false, "Cannot read properties of undefined (reading 'writeDependencies')"))
        }
        Subcommand::Unrecognized(_) => None,
    }
}

fn run_in_workspace(
    root: &Path,
    args: &[OsString],
    subcommand: &Subcommand,
    chalk: Chalk,
) -> io::Result<Outcome> {
    if let Subcommand::Circular { json, include_deps } = subcommand {
        return run_circular(root, args, chalk, *json, *include_deps);
    }
    if let Subcommand::DiagnosePackage { package } = subcommand {
        return diagnose::run_package(root, args, package, chalk);
    }
    if let Subcommand::Blame { component, dep } = subcommand {
        return blame::run(root, args, component, dep, chalk);
    }
    if let Subcommand::Diagnose { origins } = subcommand {
        return diagnose::report::run(root, args, chalk, *origins);
    }
    run_prepared(root, args, subcommand, chalk)
}

fn run_why(args: &[OsString]) -> io::Result<Outcome> {
    let Some(argv) = workspace_command::utf8_args(args) else {
        return Ok(Outcome::Declined("why arguments are not UTF-8".into()));
    };
    let Some(subcommand) = parse_why(&argv[1..]) else {
        return Ok(Outcome::Declined("outside native why grammar".into()));
    };
    let cwd = env::current_dir()?;
    let chalk = Chalk::detect(args);
    let Some(root) = workspace::root(&cwd) else {
        return run_without_workspace(&cwd, args, &subcommand, chalk);
    };
    run_prepared(&root, args, &subcommand, chalk)
}

fn run_prepared(
    root: &Path,
    args: &[OsString],
    subcommand: &Subcommand,
    chalk: Chalk,
) -> io::Result<Outcome> {
    let label = subcommand.loader_label();
    match prepare(root, subcommand, chalk) {
        Ok(prepared) => {
            workspace_command::execute_then(root, args, label, |_output| prepared.commit(chalk))
        }
        Err(Failure::User(message)) => {
            if env::var_os("CI").is_some_and(|value| !value.is_empty()) {
                return Ok(Outcome::Declined("CI deps error stack".into()));
            }
            workspace_command::execute_then(root, args, label, |_output| {
                Err(io::Error::other(message))
            })
        }
        Err(Failure::Declined(reason)) => Ok(Outcome::Declined(format!("deps: {reason}"))),
    }
}

fn run_circular(
    root: &Path,
    args: &[OsString],
    chalk: Chalk,
    json: bool,
    include_deps: bool,
) -> io::Result<Outcome> {
    let cycles = match insights::workspace_cycles(root, include_deps) {
        Ok(cycles) => cycles,
        Err(Failure::Declined(reason) | Failure::User(reason)) => {
            return Ok(Outcome::Declined(format!("deps circular: {reason}")));
        }
    };
    if json {
        let data = serde_json::to_string_pretty(&cycles)?;
        workspace_command::execute_json(root, args, "circular", |_| {
            Ok(Report { data, code: 0, details: None })
        })
    } else {
        let data = insights::render::cycles(&cycles, chalk);
        workspace_command::execute_then(root, args, "circular", |_| {
            Ok(Report { data, code: 0, details: None })
        })
    }
}

fn run_unrecognized(args: &[OsString], sub: &str, chalk: Chalk) -> io::Result<Outcome> {
    let data = chalk.red(&format!(
        r#""{sub}" is not a subcommand of "dependencies", please run "bit dependencies --help" to list the subcommands"#,
    ));
    let report = Report { data, code: 0, details: None };
    match scope_root::discover().ok().flatten() {
        Some(root) if !root.bare => {
            workspace_command::execute_then(&root.path, args, "deps", |_| Ok(report))
        }
        Some(root) => workspace_command::execute_with_scope(&root.path, args, "deps", &report),
        None => {
            let mut stdout = io::stdout().lock();
            writeln!(stdout, "{}", report.data)?;
            stdout.flush()?;
            Ok(Outcome::Exit(ExitCode::SUCCESS))
        }
    }
}

fn prepare(root: &Path, subcommand: &Subcommand, chalk: Chalk) -> Result<Prepared, Failure> {
    let (mutation, bitmap) = BitmapMutation::load(root)?;
    match subcommand {
        Subcommand::Set {
            pattern,
            packages,
            dev,
            optional,
            peer,
        } => {
            let spec = SetSpec { pattern, packages, dev: *dev, optional: *optional, peer: *peer };
            let (mutation, changed_comps, added_packages) =
                prepare_set(mutation, &bitmap, &spec, chalk)?;
            Ok(Prepared::Set { mutation, changed_comps, added_packages })
        }
        Subcommand::Remove { pattern, packages, dev, peer } => {
            prepare_remove_cmd(mutation, &bitmap, (pattern, packages, *dev, *peer, false), chalk)
        }
        Subcommand::Unset { pattern, packages, dev, peer } => {
            prepare_remove_cmd(mutation, &bitmap, (pattern, packages, *dev, *peer, true), chalk)
        }
        Subcommand::Reset { pattern } => {
            prepare_reset_or_eject(mutation, &bitmap, pattern, false, chalk)
        }
        Subcommand::Eject { pattern } => {
            prepare_reset_or_eject(mutation, &bitmap, pattern, true, chalk)
        }
        other => prepare_non_mutating(root, &bitmap, &mutation.bitmap_val, other, chalk),
    }
}

fn prepare_non_mutating(
    root: &Path,
    bitmap: &Bitmap,
    bitmap_val: &Value,
    subcommand: &Subcommand,
    chalk: Chalk,
) -> Result<Prepared, Failure> {
    match subcommand {
        Subcommand::Get { id, tree, scope } => {
            Ok(Prepared::ReadOnly(prepare_get(root, bitmap, bitmap_val, id, *tree, *scope, chalk)?))
        }
        Subcommand::Debug { id } => {
            Ok(Prepared::ReadOnly(debug::prepare(root, bitmap, id, chalk)?))
        }
        Subcommand::Usage { dep_name, depth } | Subcommand::Why { dep_name, depth } => {
            Ok(Prepared::ReadOnly(prepare_usage(root, bitmap_val, dep_name, *depth, chalk)?))
        }
        Subcommand::Write { target } => {
            let (root, target, dependencies) = prepare_write(root, bitmap_val, *target)?;
            Ok(Prepared::Write { root, target, dependencies })
        }
        _ => Err(Failure::Declined("handled earlier".into())),
    }
}

fn prepare_remove_cmd(
    mutation: BitmapMutation,
    bitmap: &Bitmap,
    args: (&str, &[String], bool, bool, bool),
    chalk: Chalk,
) -> Result<Prepared, Failure> {
    let (pattern, packages, dev, peer, remove_only_if_exists) = args;
    let spec = RemoveSpec { pattern, packages, dev, peer, remove_only_if_exists };
    let (mutation, removed, unset) = prepare_remove(mutation, bitmap, &spec, chalk)?;
    Ok(Prepared::Remove { mutation, removed, unset })
}

fn prepare_reset_or_eject(
    mutation: BitmapMutation,
    bitmap: &Bitmap,
    pattern: &str,
    eject: bool,
    chalk: Chalk,
) -> Result<Prepared, Failure> {
    let spec = if eject {
        ListActionSpec {
            pattern,
            reason: format!("deps-eject ({pattern})"),
            summary: "successfully ejected dependencies",
            config: json!({}),
            merge_existing: true,
            merge_previous: true,
        }
    } else {
        ListActionSpec {
            pattern,
            reason: format!("deps-reset ({pattern})"),
            summary: "successfully reset dependencies",
            config: json!({ "policy": {} }),
            merge_existing: false,
            merge_previous: false,
        }
    };
    let (mutation, summary, comps) = prepare_list_action(mutation, bitmap, spec, chalk)?;
    Ok(Prepared::ListAction { mutation, summary, comps })
}

impl Prepared {
    fn commit(self, chalk: Chalk) -> io::Result<Report> {
        let data = match self {
            Self::Set {
                mutation,
                changed_comps,
                added_packages,
            } => commit_set(&Formatter::new(chalk), &mutation, &changed_comps, &added_packages)?,
            Self::Remove { mutation, removed, unset } => {
                mutation.flush()?;
                render_remove(&Formatter::new(chalk), &removed, unset)
            }
            Self::ListAction { mutation, summary, comps } => {
                commit_list_action(&Formatter::new(chalk), &mutation, summary, &comps)?
            }
            Self::ReadOnly(out) => out,
            Self::Write { root, target, dependencies } => {
                commit_write(&root, target, &dependencies)?
            }
        };
        Ok(Report { data, code: 0, details: None })
    }
}
