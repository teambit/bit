//! Native reset of local main and lane histories while preserving working-tree bytes.

mod reports;
mod selection;

use reports::{report, soft_report};

use super::{
    color::Chalk,
    list::bitmap,
    workspace_command::{self, format::Formatter, results::Report},
};
use crate::{commands::Command, native::Outcome, workspace};
use bit_object_import::{
    reset_lane::Batch as LaneBatch,
    reset_main::{Batch, Plan},
    reset_never_exported::Plan as NeverPlan,
    reset_soft::Plan as SoftPlan,
};
use std::{env, ffi::OsString, io, path::Path};

pub const COMMAND: Command = Command { name: "reset", aliases: &[], run };
const LANE_CI_DIAGNOSTIC: &str = "CI lane reset diagnostics require the published stack";

struct Options<'a> {
    pattern: Option<&'a str>,
    head: bool,
    force: bool,
    soft: bool,
    silent: bool,
    never_exported: bool,
    selected: Option<selection::Selected>,
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
            "--silent" | "-s" | "--all" | "-a" if !silent => silent = true,
            arg if !arg.starts_with('-') && pattern.is_none() && arg.len() <= 4096 => {
                pattern = Some(arg);
            }
            _ => return None,
        }
    }
    Some(Options { pattern, head, force, soft, silent, never_exported, selected: None })
}

fn run(args: &[OsString]) -> io::Result<Outcome> {
    let Some(argv) = workspace_command::utf8_args(args) else {
        return Ok(Outcome::Declined("reset arguments are not UTF-8".into()));
    };
    let Some(mut options) = parse(&argv[1..]) else {
        return Ok(Outcome::Declined("outside the native reset grammar".into()));
    };
    let Some(root) = workspace::root(&env::current_dir()?) else {
        return Ok(Outcome::Declined("not inside a workspace".into()));
    };
    if !options.soft
        && !options.never_exported
        && options.pattern.is_some_and(selection::stateful)
        && env::var_os("CI").is_some_and(|value| !value.is_empty())
        && bitmap::read(&root)?.lane.is_some()
    {
        return Ok(Outcome::Declined(LANE_CI_DIAGNOSTIC.into()));
    }
    let mut startup = super::status::autosync::Startup::default();
    if let Some(pattern) = options.pattern.filter(|pattern| selection::stateful(pattern)) {
        match selection::states(&root, pattern, &mut startup) {
            Ok(selected) => options.selected = Some(selected),
            Err(error) => return selection_failure(args, &root, &startup, error),
        }
    }
    run_prepared(args, &root, &options, &startup)
}

fn run_prepared(
    args: &[OsString],
    root: &Path,
    options: &Options<'_>,
    startup: &super::status::autosync::Startup,
) -> io::Result<Outcome> {
    workspace_command::checkout_lifecycle::before(startup)?;
    match dispatch(args, root, options)? {
        Outcome::Declined(reason) if startup.committed => {
            workspace_command::execute_then(root, args, "reset", |output| {
                if let Some(selected) = &options.selected {
                    selected.render(output);
                }
                Err(io::Error::other(reason))
            })
        }
        outcome => Ok(outcome),
    }
}

fn selection_failure(
    args: &[OsString],
    root: &Path,
    startup: &super::status::autosync::Startup,
    error: io::Error,
) -> io::Result<Outcome> {
    if startup.committed {
        workspace_command::checkout_lifecycle::failure(root, args, "reset", startup, error)
    } else {
        Ok(Outcome::Declined(format!("reset selection: {error}")))
    }
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
    if options.head || (options.pattern.is_none() && !options.silent) {
        return Ok(Outcome::Declined("outside the native soft reset grammar".into()));
    }
    run_soft(args, root, options)
}

fn route_hard(args: &[OsString], root: &Path, options: &Options<'_>) -> io::Result<Outcome> {
    let Some(pattern) = options.pattern else {
        if !options.silent {
            return Ok(Outcome::Declined("reset all components requires confirmation".into()));
        }
        return run_batch(args, root, options.head, None, true);
    };
    if selection::complex(pattern) {
        let selected = match options.selected
            .clone()
            .map_or_else(
                || selection::identities(root, pattern).map(selection::Selected::ordinary),
                Ok,
            ) {
            Ok(selected) => selected,
            Err(error) => return Ok(Outcome::Declined(format!("reset selection: {error}"))),
        };
        return run_batch(args, root, options.head, Some(&selected), options.force);
    }
    let (identity, on_lane) = match identity(root, pattern) {
        Ok(identity) => identity,
        Err(error) => return Ok(Outcome::Declined(format!("reset identity: {error}"))),
    };
    if on_lane {
        return run_lane(args, root, &identity, options.head, options.force);
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
    force: bool,
) -> io::Result<Outcome> {
    let selected = selection::Selected::ordinary(vec![identity.to_owned()]);
    run_lane_batch(args, root, head_only, Some(&selected), force)
}

fn run_batch(
    args: &[OsString],
    root: &Path,
    head_only: bool,
    selected: Option<&selection::Selected>,
    force: bool,
) -> io::Result<Outcome> {
    if bitmap::read(root)?.lane.is_some() {
        return run_lane_batch(args, root, head_only, selected, force);
    }
    let batch = match selected.map_or_else(
        || Batch::prepare(root, head_only),
        |ids| Batch::prepare_selected(root, &ids.identities, head_only, force),
    ) {
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
    workspace_command::execute_with(root, args, "reset", &report, |output| {
        if let Some(selected) = selected {
            selected.render(output);
            selected.verify()?;
        }
        batch.commit(&workspace_command::file_id())
    })
}

fn run_lane_batch(
    args: &[OsString],
    root: &Path,
    head_only: bool,
    selected: Option<&selection::Selected>,
    force: bool,
) -> io::Result<Outcome> {
    let batch = match selected.map_or_else(
        || LaneBatch::prepare(root, head_only),
        |ids| LaneBatch::prepare_selected(root, &ids.identities, head_only, force),
    ) {
        Ok(batch) => batch,
        Err(error) if bit_object_import::reset_lane::diagnostic(&error).is_some() => {
            return lane_failure(args, root, selected, error);
        }
        Err(error) => return Ok(Outcome::Declined(format!("lane reset batch: {error}"))),
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
    workspace_command::execute_with(root, args, "reset", &report, |output| {
        if let Some(selected) = selected {
            selected.render(output);
            selected.verify()?;
        }
        batch.commit(&workspace_command::file_id())
    })
}

fn lane_failure(
    args: &[OsString],
    root: &Path,
    selected: Option<&selection::Selected>,
    error: io::Error,
) -> io::Result<Outcome> {
    if env::var_os("CI").is_some_and(|value| !value.is_empty()) {
        return Ok(Outcome::Declined(LANE_CI_DIAGNOSTIC.into()));
    }
    workspace_command::execute_then(root, args, "reset", |output| {
        if let Some(selected) = selected {
            selected.render(output);
            selected.verify()?;
        }
        bit_object_import::reset_lane::apply_error_prefix(&error)?;
        Err(error)
    })
}

fn run_soft(args: &[OsString], root: &Path, options: &Options<'_>) -> io::Result<Outcome> {
    let selected = match options.selected
        .clone()
        .map(Ok)
        .or_else(|| {
            options.pattern
                .filter(|pattern| selection::complex(pattern))
                .map(|pattern| {
                    selection::identities(root, pattern).map(selection::Selected::ordinary)
                })
        })
        .transpose()
    {
        Ok(selected) => selected,
        Err(error) => return Ok(Outcome::Declined(format!("soft reset selection: {error}"))),
    };
    let plan = match selected
        .as_ref()
        .map_or_else(
            || SoftPlan::prepare(root, options.pattern),
            |ids| SoftPlan::prepare_selected(root, &ids.identities),
        ) {
        Ok(plan) => plan,
        Err(error) => return Ok(Outcome::Declined(format!("soft reset: {error}"))),
    };
    let report = soft_report(args, &plan);
    workspace_command::execute_with(root, args, "reset", &report, |output| {
        if let Some(selected) = &selected {
            selected.render(output);
            selected.verify()?;
        }
        plan.commit(&workspace_command::file_id())
    })
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
    if !matched[0].on_current_lane_including_removed(&[]) || matched[0].staged_deprecation {
        return Err(io::Error::other("reset component unavailable on main"));
    }
    Ok((matched[0].identity.clone(), bitmap.lane.is_some()))
}
