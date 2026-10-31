//! Native reset of local main and lane histories while preserving working-tree bytes.

mod main_ext;
mod reports;
mod selection;

use super::{list::bitmap, workspace_command};
use crate::{commands::Command, native::Outcome, workspace};
use bit_object_import::{
    reset_lane::Batch as LaneBatch,
    reset_main::{Batch, Plan},
    reset_never_exported::Plan as NeverPlan,
    reset_soft::Plan as SoftPlan,
};
use reports::{batch_report, never_exported_report, report, soft_report};
use selection::LANE_CI_DIAGNOSTIC;
use std::{env, ffi::OsString, io, path::Path};

pub const COMMAND: Command = Command { name: "reset", aliases: &[], run };

#[derive(Default)]
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
    let mut options = Options::default();
    let mut iter = args.iter().copied();
    while let Some(arg) = iter.next() {
        if arg == "--" {
            for rest in iter {
                (!rest.is_empty() && !rest.starts_with('-')).then_some(())?;
                apply_reset_arg(rest, &mut options)?;
            }
            break;
        }
        apply_reset_arg(arg, &mut options)?;
    }
    Some(options)
}

fn apply_reset_arg<'a>(arg: &'a str, options: &mut Options<'a>) -> Option<()> {
    match arg {
        "--no-color" | "--no-color=true" | "--no-color=false" | "--color" | "--color=true"
        | "--color=false" | "--color=always" | "--color=never" => {}
        "--head" | "--head=true" => options.head = true,
        "--head=false" => options.head = false,
        "--force" | "-f" | "--force=true" => options.force = true,
        "--force=false" => options.force = false,
        "--soft" | "--soft=true" => options.soft = true,
        "--soft=false" => options.soft = false,
        "--never-exported" | "--never-exported=true" => options.never_exported = true,
        "--never-exported=false" => options.never_exported = false,
        "--silent" | "-s" | "--silent=true" | "--all" | "-a" | "--all=true" => {
            options.silent = true;
        }
        "--silent=false" | "--all=false" => options.silent = false,
        arg if is_combined_reset_short(arg) => apply_combined_reset_short(arg, options),
        arg if !arg.starts_with('-')
            && !arg.trim().is_empty()
            && options.pattern.is_none()
            && arg.len() <= 4096 =>
        {
            options.pattern = Some(arg.trim());
        }
        _ => return None,
    }
    Some(())
}

fn is_combined_reset_short(arg: &str) -> bool {
    arg.starts_with('-')
        && !arg.starts_with("--")
        && arg.len() > 1
        && arg[1..]
            .bytes()
            .all(|byte| matches!(byte, b'f' | b's' | b'a'))
}

fn apply_combined_reset_short(arg: &str, options: &mut Options<'_>) {
    for byte in arg[1..].bytes() {
        if byte == b'f' {
            options.force = true;
        } else {
            options.silent = true;
        }
    }
}

fn run(args: &[OsString]) -> io::Result<Outcome> {
    let Some(argv) = workspace_command::utf8_args(args) else {
        return Ok(Outcome::Declined("reset arguments are not UTF-8".into()));
    };
    let Some(mut options) = parse(&argv[1..]) else {
        return Ok(Outcome::Declined("outside the native reset grammar".into()));
    };
    let cwd = env::current_dir()?;
    let Some(root) = workspace::root(&cwd) else {
        return run_without_workspace(&cwd, args, &options);
    };
    if needs_lane_ci_decline(&root, &options)? {
        return Ok(Outcome::Declined(LANE_CI_DIAGNOSTIC.into()));
    }
    let mut startup = super::status::autosync::Startup::default();
    if !(options.never_exported || options.soft && options.head)
        && let Some(pattern) = options.pattern.filter(|pattern| selection::stateful(pattern))
    {
        match selection::states(&root, pattern, &mut startup) {
            Ok(selected) => options.selected = Some(selected),
            Err(error) => return selection_failure(args, &root, &startup, error),
        }
    }
    run_prepared(args, &root, &options, &startup)
}

fn needs_lane_ci_decline(root: &Path, options: &Options<'_>) -> io::Result<bool> {
    if options.soft
        || options.never_exported
        || !options.pattern.is_some_and(selection::stateful)
        || env::var_os("CI").is_none_or(|value| value.is_empty())
    {
        return Ok(false);
    }
    Ok(bitmap::read(root)?.lane.is_some())
}

fn run_without_workspace(
    cwd: &Path,
    args: &[OsString],
    options: &Options<'_>,
) -> io::Result<Outcome> {
    if env::var_os("CI").is_some_and(|value| !value.is_empty()) {
        return Ok(Outcome::Declined("not inside a workspace".into()));
    }
    let msg = if options.never_exported {
        "Cannot read properties of undefined (reading 'consumer')"
    } else if options.soft && options.head {
        "please specify either --soft or --head flag, not both"
    } else if options.pattern.is_some() || options.silent {
        super::log::OUTSIDE_WORKSPACE_ERR
    } else {
        return Ok(Outcome::Declined("not inside a workspace".into()));
    };
    workspace_command::execute_failure_scope(cwd, args, "reset", false, "", io::Error::other(msg))
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
        return run_never_exported(args, root);
    }
    if options.soft {
        return route_soft(args, root, options);
    }
    route_hard(args, root, options)
}

fn route_soft(args: &[OsString], root: &Path, options: &Options<'_>) -> io::Result<Outcome> {
    if options.head {
        if env::var_os("CI").is_some_and(|value| !value.is_empty()) {
            return Ok(Outcome::Declined("CI reset soft+head".into()));
        }
        return workspace_command::execute_then(root, args, "reset", |_| {
            Err(io::Error::other("please specify either --soft or --head flag, not both"))
        });
    }
    if options.pattern.is_none() && !options.silent {
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
    let (identity, on_lane) = match selection::identity(root, pattern) {
        Ok(identity) => identity,
        Err(_) if main_ext::missing_component(root, pattern) => {
            return workspace_command::execute_then(root, args, "reset", |_| {
                Err(io::Error::other(format!(
                    r#"error: component "{pattern}" was not found on your local workspace."#,
                )))
            });
        }
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
        Err(error) if !force && error.to_string() == "reset version has a dependent" => {
            if let Some(message) = main_ext::dependent_error(root, identity, head) {
                return workspace_command::execute_then(root, args, "reset", |_| {
                    Err(io::Error::other(message))
                });
            }
            return Ok(Outcome::Declined(format!("reset: {error}")));
        }
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
    let report = never_exported_report(args, &plan.labels);
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
        Err(_) if !head_only && selected.is_none() => {
            if let Ok(detached) = main_ext::DetachedBatch::prepare(root) {
                return run_detached_batch(args, root, &detached);
            }
            return Ok(Outcome::Declined("reset batch: detached fallback failed".into()));
        }
        Err(error) => return Ok(Outcome::Declined(format!("reset batch: {error}"))),
    };
    let report = batch_report(args, batch.results());
    workspace_command::execute_with(root, args, "reset", &report, |output| {
        if let Some(selected) = selected {
            selected.render(output);
            selected.verify()?;
        }
        batch.commit(&workspace_command::file_id())
    })
}

/// Format and commit a prepared detached-head main-lane batch reset.
fn run_detached_batch(
    args: &[OsString],
    root: &Path,
    batch: &main_ext::DetachedBatch,
) -> io::Result<Outcome> {
    let report = batch_report(args, batch.results());
    workspace_command::execute_with(root, args, "reset", &report, |_| {
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
            return selection::lane_failure(args, root, selected, &error);
        }
        Err(error) => return Ok(Outcome::Declined(format!("lane reset batch: {error}"))),
    };
    let report = batch_report(args, batch.results());
    workspace_command::execute_with(root, args, "reset", &report, |output| {
        if let Some(selected) = selected {
            selected.render(output);
            selected.verify()?;
        }
        batch.commit(&workspace_command::file_id())
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
