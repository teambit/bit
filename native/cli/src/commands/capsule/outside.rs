//! Capsule command behavior outside a workspace or scope.

use super::{Subcommand, delete_and_report, prune};
use crate::{
    commands::{color::Chalk, globals::resolve_capsules_dir, workspace_command},
    native::Outcome,
};
use std::{
    ffi::OsString,
    io::{self, Write},
    path::Path,
    process::ExitCode,
};

pub(super) fn run_outside_scope(
    cwd: &Path,
    args: &[OsString],
    argv: &[&str],
    chalk: Chalk,
    subcommand: &Subcommand,
) -> io::Result<Outcome> {
    match argv {
        ["capsule", "create"] => {
            return run_outside_failure(
                chalk,
                "create",
                "undefined is not iterable (cannot read property Symbol(Symbol.iterator))",
            );
        }
        ["capsule", "create", _] if matches!(subcommand, Subcommand::Create(create_args) if create_args.ids.len() == 1) =>
        {
            return run_outside_failure(
                chalk,
                "create",
                "Cannot read properties of undefined (reading 'shouldUseHashForCapsules')",
            );
        }
        ["capsule", "delete"] => return run_delete_all_outside_scope(cwd, args, chalk),
        ["capsule", "delete", "--scope-aspects"] => {
            return run_outside_failure(
                chalk,
                "delete",
                "Cannot read properties of undefined (reading 'getAspectCapsulePath')",
            );
        }
        _ => {}
    }
    match subcommand {
        Subcommand::Delete { all: true, .. } => run_delete_all_outside_scope(cwd, args, chalk),
        Subcommand::Prune(prune_args) => prune::run_outside(cwd, args, chalk, prune_args),
        Subcommand::BareList | Subcommand::List { .. } => run_list_outside_scope(chalk, subcommand),
        _ => Ok(Outcome::Declined("capsule requires a workspace or scope".into())),
    }
}

fn run_outside_failure(chalk: Chalk, label: &str, error: &str) -> io::Result<Outcome> {
    if std::env::var_os("CI").is_some_and(|value| !value.is_empty()) {
        return Ok(Outcome::Declined("capsule CI error stack delegated".into()));
    }
    let output = workspace_command::loader_output(chalk, false);
    output.restart(&format!(r#"running command "{label}"..."#));
    output.stop();
    writeln!(io::stderr(), "{error}")?;
    Ok(Outcome::Exit(ExitCode::FAILURE))
}

fn run_list_outside_scope(chalk: Chalk, subcommand: &Subcommand) -> io::Result<Outcome> {
    if std::env::var_os("CI").is_some_and(|value| !value.is_empty()) {
        return Ok(Outcome::Declined("capsule list CI error stack delegated".into()));
    }
    let json = matches!(subcommand, Subcommand::List { json: true, .. });
    let output = workspace_command::loader_output(chalk, json);
    output.restart(&format!(r#"running command "{}"..."#, subcommand.loader_label()));
    output.stop();
    writeln!(
        io::stderr(),
        "This command requires a Bit workspace or scope.\nTo initialize a workspace: bit init",
    )?;
    Ok(Outcome::Exit(ExitCode::FAILURE))
}

fn run_delete_all_outside_scope(
    cwd: &Path,
    args: &[OsString],
    chalk: Chalk,
) -> io::Result<Outcome> {
    let Ok(target_dir) = resolve_capsules_dir(cwd) else {
        return Ok(Outcome::Declined("capsule delete --all cache root delegated".into()));
    };
    let report = delete_and_report(&target_dir, chalk)?;
    workspace_command::execute_with_scope(cwd, args, "delete", &report)
}
