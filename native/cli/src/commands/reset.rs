//! Native main-lane `bit reset <component>` for a linear local history.

use super::{
    color::Chalk,
    list::bitmap,
    workspace_command::{self, format::Formatter, results::Report},
};
use crate::{commands::Command, native::Outcome, workspace};
use bit_object_import::{
    reset_lane::Plan as LanePlan,
    reset_main::{Batch, Plan},
    reset_never_exported::Plan as NeverPlan,
    reset_soft::Plan as SoftPlan,
};
use std::{env, ffi::OsString, io, path::Path};

pub const COMMAND: Command = Command { name: "reset", aliases: &[], run };

struct Options<'a> {
    pattern: Option<&'a str>,
    head: bool,
    force: bool,
    soft: bool,
    silent: bool,
    never_exported: bool,
}

fn parse<'a>(args: &[&'a str]) -> Option<Options<'a>> {
    let mut pattern = None;
    let mut head = false;
    let mut force = false;
    let mut soft = false;
    let mut silent = false;
    let mut never_exported = false;
    for arg in args {
        match *arg {
            "--head" if !head => head = true,
            "--force" | "-f" if !force => force = true,
            "--soft" if !soft => soft = true,
            "--never-exported" if !never_exported => never_exported = true,
            "--silent" | "-s" if !silent => silent = true,
            arg if !arg.starts_with('-')
                && pattern.is_none()
                && !arg.contains(['*', '?', '{', '}']) =>
            {
                pattern = Some(arg);
            }
            _ => return None,
        }
    }
    Some(Options { pattern, head, force, soft, silent, never_exported })
}

fn run(args: &[OsString]) -> io::Result<Outcome> {
    let Some(argv) = workspace_command::utf8_args(args) else {
        return Ok(Outcome::Declined("reset arguments are not UTF-8".into()));
    };
    let Some(options) = parse(&argv[1..]) else {
        return Ok(Outcome::Declined("outside the native reset grammar".into()));
    };
    let Some(root) = workspace::root(&env::current_dir()?) else {
        return Ok(Outcome::Declined("not inside a workspace".into()));
    };
    dispatch(args, &root, &options)
}

fn dispatch(args: &[OsString], root: &Path, options: &Options<'_>) -> io::Result<Outcome> {
    if options.never_exported {
        return route_never_exported(args, root, options);
    }
    if options.soft {
        return route_soft(args, root, options);
    }
    route_hard(args, root, options)
}

fn route_never_exported(
    args: &[OsString],
    root: &Path,
    options: &Options<'_>,
) -> io::Result<Outcome> {
    if options.pattern.is_some() || options.head || options.force || options.soft {
        return Ok(Outcome::Declined("outside the native never-exported grammar".into()));
    }
    run_never_exported(args, root)
}

fn route_soft(args: &[OsString], root: &Path, options: &Options<'_>) -> io::Result<Outcome> {
    if options.head || options.force || (options.pattern.is_none() && !options.silent) {
        return Ok(Outcome::Declined("outside the native soft reset grammar".into()));
    }
    run_soft(args, root, options.pattern)
}

fn route_hard(args: &[OsString], root: &Path, options: &Options<'_>) -> io::Result<Outcome> {
    let Some(pattern) = options.pattern else {
        if !options.silent {
            return Ok(Outcome::Declined("reset all components requires confirmation".into()));
        }
        return run_batch(args, root, options.head);
    };
    let (identity, on_lane) = match identity(root, pattern) {
        Ok(identity) => identity,
        Err(error) => return Ok(Outcome::Declined(format!("reset identity: {error}"))),
    };
    if on_lane {
        if !options.force {
            return Ok(Outcome::Declined("lane reset dependency guard".into()));
        }
        return run_lane(args, root, &identity, options.head);
    }
    run_main(args, root, &identity, options.head, options.force)
}

fn run_main(
    args: &[OsString],
    root: &Path,
    identity: &str,
    head: bool,
    force: bool,
) -> io::Result<Outcome> {
    let plan = match Plan::prepare(root, identity, head, force) {
        Ok(plan) => plan,
        Err(error) => return Ok(Outcome::Declined(format!("reset: {error}"))),
    };
    let report = report(args, identity, &plan.selection.labels);
    workspace_command::execute_with(root, args, "reset", &report, |_| {
        plan.commit(&workspace_command::file_id())
    })
}

fn run_never_exported(args: &[OsString], root: &Path) -> io::Result<Outcome> {
    let plan = match NeverPlan::prepare(root) {
        Ok(plan) => plan,
        Err(error) => return Ok(Outcome::Declined(format!("never-exported reset: {error}"))),
    };
    let formatter = Formatter::new(Chalk::detect(args));
    let items = plan.labels
        .iter()
        .map(|label| formatter.item(label))
        .collect::<Vec<_>>();
    let count = items.len();
    let report = Report {
        data: Formatter::join(&[
            formatter.section("reset never-exported components", "", &items),
            formatter.success_summary(&format!(
                "successfully reset {count} never-exported component(s)",
            )),
        ]),
        code: 0,
        details: None,
    };
    workspace_command::execute_with(root, args, "reset", &report, |_| {
        plan.commit(&workspace_command::file_id())
    })
}

fn run_lane(
    args: &[OsString],
    root: &Path,
    identity: &str,
    head_only: bool,
) -> io::Result<Outcome> {
    let plan = match LanePlan::prepare(root, identity, head_only) {
        Ok(plan) => plan,
        Err(error) => return Ok(Outcome::Declined(format!("lane reset: {error}"))),
    };
    let report = report(args, identity, &plan.labels);
    workspace_command::execute_with(root, args, "reset", &report, |_| {
        plan.commit(&workspace_command::file_id())
    })
}

fn run_batch(args: &[OsString], root: &Path, head_only: bool) -> io::Result<Outcome> {
    let batch = match Batch::prepare(root, head_only) {
        Ok(batch) => batch,
        Err(error) => return Ok(Outcome::Declined(format!("reset batch: {error}"))),
    };
    let formatter = Formatter::new(Chalk::detect(args));
    let items: Vec<_> = batch
        .results()
        .map(|(identity, labels)| {
            formatter.item(&format!(
                "{} - version(s): {}",
                formatter.chalk.cyan(identity),
                labels.join(", "),
            ))
        })
        .collect();
    let count = items.len();
    let report = Report {
        data: Formatter::join(&[
            formatter.section("reset components", "", &items),
            formatter.success_summary(&format!("{count} component(s) reset successfully")),
        ]),
        code: 0,
        details: None,
    };
    workspace_command::execute_with(root, args, "reset", &report, |_| {
        batch.commit(&workspace_command::file_id())
    })
}

fn run_soft(args: &[OsString], root: &Path, pattern: Option<&str>) -> io::Result<Outcome> {
    let plan = match SoftPlan::prepare(root, pattern) {
        Ok(plan) => plan,
        Err(error) => return Ok(Outcome::Declined(format!("soft reset: {error}"))),
    };
    let report = soft_report(args, &plan);
    workspace_command::execute_with(root, args, "reset", &report, |_| {
        plan.commit(&workspace_command::file_id())
    })
}

fn soft_report(args: &[OsString], plan: &SoftPlan) -> Report {
    let formatter = Formatter::new(Chalk::detect(args));
    let items: Vec<_> = plan.entries
        .iter()
        .map(|entry| {
            formatter.item(&format!(
                "{} - version(s): {}",
                formatter.chalk.cyan(&entry.identity),
                entry.version,
            ))
        })
        .collect();
    let count = items.len();
    Report {
        data: Formatter::join(&[
            formatter.section(
                "soft-untagged components",
                "soft-untagged versions are no longer candidates for tagging",
                &items,
            ),
            formatter.success_summary(&format!("{count} component(s) soft-untagged successfully")),
        ]),
        code: 0,
        details: None,
    }
}

fn identity(root: &Path, pattern: &str) -> io::Result<(String, bool)> {
    let bitmap = bitmap::read(root)?;
    let matched: Vec<_> = bitmap.entries
        .iter()
        .filter(|entry| {
            entry.identity == pattern
                || entry.identity
                    .rsplit_once('/')
                    .is_some_and(|(_, name)| name == pattern)
        })
        .collect();
    if matched.len() != 1 {
        return Err(io::Error::other("reset identity absent or ambiguous"));
    }
    if !matched[0].on_current_lane(&[]) || matched[0].staged_deprecation {
        return Err(io::Error::other("reset component unavailable on main"));
    }
    Ok((matched[0].identity.clone(), bitmap.lane.is_some()))
}

fn report(args: &[OsString], identity: &str, labels: &[String]) -> Report {
    let formatter = Formatter::new(Chalk::detect(args));
    let item = formatter.item(&format!(
        "{} - version(s): {}",
        formatter.chalk.cyan(identity),
        labels.join(", "),
    ));
    Report {
        data: Formatter::join(&[
            formatter.section("reset components", "", &[item]),
            formatter.success_summary("1 component(s) reset successfully"),
        ]),
        code: 0,
        details: None,
    }
}
