//! Native `bit deps <set|remove|unset|reset|eject|get|usage|write>` (`bit dependencies`)
//! (`scopes/dependencies/dependencies/dependencies-cmd.ts`).

pub(super) use self::parse::parse_subcommand;

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
        BitmapMutation, ListActionSpec, SetSpec, format_json_indent_4, prepare_list_action,
        prepare_set,
    },
    remove::{RemoveSpec, RemovedByComp, prepare_remove, render_remove},
    usage::prepare_usage,
    write::{WriteTarget, commit_write, prepare_write},
};
use super::{
    Command,
    color::Chalk,
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

#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) enum Subcommand {
    Set { pattern: String, packages: Vec<(String, String)>, dev: bool, optional: bool, peer: bool },
    Remove { pattern: String, packages: Vec<String>, dev: bool, peer: bool },
    Unset { pattern: String, packages: Vec<String>, dev: bool, peer: bool },
    Reset { pattern: String },
    Eject { pattern: String },
    Get { id: String },
    Usage { dep_name: String, depth: Option<usize> },
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
            Self::Usage { .. } => "usage",
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
    let Some(root) = workspace::root(&env::current_dir()?) else {
        return Ok(Outcome::Declined("deps requires a workspace".into()));
    };
    let label = subcommand.loader_label();
    match prepare(&root, &subcommand, chalk) {
        Ok(prepared) => {
            workspace_command::execute_then(&root, args, label, |_output| prepared.commit(chalk))
        }
        Err(Failure::User(message)) => {
            if env::var_os("CI").is_some_and(|value| !value.is_empty()) {
                return Ok(Outcome::Declined("CI deps error stack".into()));
            }
            workspace_command::execute_then(&root, args, label, |_output| {
                Err(io::Error::other(message))
            })
        }
        Err(Failure::Declined(reason)) => Ok(Outcome::Declined(format!("deps: {reason}"))),
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
        Subcommand::Get { id } => {
            Ok(Prepared::ReadOnly(prepare_get(root, bitmap, bitmap_val, id, chalk)?))
        }
        Subcommand::Usage { dep_name, depth } => {
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

fn commit_set(
    formatter: &Formatter,
    mutation: &BitmapMutation,
    changed_comps: &[String],
    added_packages: &Value,
) -> io::Result<String> {
    mutation.flush()?;
    let comp_items = changed_comps
        .iter()
        .map(|comp| formatter.item(comp))
        .collect::<Vec<_>>();
    let comp_section = formatter.section("changed components", "", &comp_items);
    let pkg_section = format!(
        "{}\n{}",
        formatter.title("added packages"),
        format_json_indent_4(added_packages)?,
    );
    Ok(Formatter::join(&[
        formatter.success_summary("successfully updated dependencies"),
        comp_section,
        pkg_section,
    ]))
}

fn commit_list_action(
    formatter: &Formatter,
    mutation: &BitmapMutation,
    summary: &str,
    comps: &[String],
) -> io::Result<String> {
    mutation.flush()?;
    let items = comps
        .iter()
        .map(|comp| formatter.item(comp))
        .collect::<Vec<_>>();
    Ok(Formatter::join(&[formatter.success_summary(summary), items.join("\n")]))
}
