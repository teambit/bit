//! Native main-lane `bit reset <component>` for a linear local history.

use super::{
    color::Chalk,
    list::bitmap,
    workspace_command::{self, format::Formatter, results::Report},
};
use crate::{commands::Command, native::Outcome, workspace};
use bit_object_import::{
    reset_main::{Batch, Plan},
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
}

fn parse<'a>(args: &[&'a str]) -> Option<Options<'a>> {
    let mut pattern = None;
    let mut head = false;
    let mut force = false;
    let mut soft = false;
    let mut silent = false;
    for arg in args {
        match *arg {
            "--head" if !head => head = true,
            "--force" | "-f" if !force => force = true,
            "--soft" if !soft => soft = true,
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
    Some(Options { pattern, head, force, soft, silent })
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
    if options.soft {
        if options.head || options.force || (options.pattern.is_none() && !options.silent) {
            return Ok(Outcome::Declined("outside the native soft reset grammar".into()));
        }
        return run_soft(args, root, options.pattern);
    }
    let Some(pattern) = options.pattern else {
        if !options.silent {
            return Ok(Outcome::Declined("reset all components requires confirmation".into()));
        }
        return run_batch(args, root, options.head);
    };
    let identity = match identity(root, pattern) {
        Ok(identity) => identity,
        Err(error) => return Ok(Outcome::Declined(format!("reset identity: {error}"))),
    };
    let plan = match Plan::prepare(root, &identity, options.head, options.force) {
        Ok(plan) => plan,
        Err(error) => return Ok(Outcome::Declined(format!("reset: {error}"))),
    };
    let report = report(args, &identity, &plan);
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

fn identity(root: &Path, pattern: &str) -> io::Result<String> {
    let bitmap = bitmap::read(root)?;
    if bitmap.lane.is_some() {
        return Err(io::Error::other("reset on a lane"));
    }
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
    Ok(matched[0].identity.clone())
}

fn report(args: &[OsString], identity: &str, plan: &Plan) -> Report {
    let formatter = Formatter::new(Chalk::detect(args));
    let item = formatter.item(&format!(
        "{} - version(s): {}",
        formatter.chalk.cyan(identity),
        plan.selection.labels.join(", "),
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
