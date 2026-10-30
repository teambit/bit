//! Capsule command behavior outside a workspace or scope.

use super::{Subcommand, create::CreateArgs, delete_and_report, prune};
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
    match subcommand {
        Subcommand::Create(create_args) => run_create_outside_scope(chalk, argv, create_args),
        Subcommand::Delete { all: false, scope_aspects: true } => run_outside_failure(
            chalk,
            "delete",
            false,
            "Cannot read properties of undefined (reading 'getAspectCapsulePath')",
        ),
        Subcommand::Delete { all: true, .. } | Subcommand::Delete { scope_aspects: false, .. } => {
            run_delete_all_outside_scope(cwd, args, chalk)
        }
        Subcommand::Prune(prune_args) => prune::run_outside(cwd, args, chalk, prune_args),
        Subcommand::BareList | Subcommand::List { .. } => run_list_outside_scope(chalk, subcommand),
    }
}

fn run_create_outside_scope(chalk: Chalk, argv: &[&str], args: &CreateArgs) -> io::Result<Outcome> {
    if !supports_create_outside(argv, args) {
        return Ok(Outcome::Declined("capsule create outside scope delegated".into()));
    }
    let error = if args.ids.is_empty() {
        "undefined is not iterable (cannot read property Symbol(Symbol.iterator))"
    } else if args.base_dir.is_some() || args.use_hash {
        "Cannot read properties of undefined (reading 'resolveMultipleComponentIds')"
    } else {
        "Cannot read properties of undefined (reading 'shouldUseHashForCapsules')"
    };
    run_outside_failure(chalk, "create", args.json, error)
}

pub(super) fn run_create_in_bare_scope(
    chalk: Chalk,
    command_args: &[OsString],
    args: &CreateArgs,
) -> io::Result<Outcome> {
    let Some(argv) = workspace_command::utf8_args(command_args) else {
        return Ok(Outcome::Declined("capsule create non-UTF-8 arguments".into()));
    };
    if !supports_create_outside(&argv, args) {
        return Ok(Outcome::Declined("capsule create bare scope delegated".into()));
    }
    let error = match args.ids.first() {
        None => "undefined is not iterable (cannot read property Symbol(Symbol.iterator))".into(),
        Some(id) if safe_unscoped_id(id) => {
            format!("scope.getParsedId, the component {id} must include a scope-name")
        }
        _ => return Ok(Outcome::Declined("capsule create scoped ID delegated".into())),
    };
    run_outside_failure(chalk, "create", args.json, &error)
}

fn safe_unscoped_id(id: &str) -> bool {
    !id.is_empty()
        && id
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_'))
}

fn supports_create_outside(argv: &[&str], args: &CreateArgs) -> bool {
    if supports_named_create_outside(argv, args) {
        return true;
    }
    match argv {
        ["capsule", "create"] => true,
        ["capsule", "create", "--json" | "-j" | "--seeders-only" | "-s" | "--use-hash"] => true,
        ["capsule", "create", "--base-dir" | "-b" | "--root-base-dir" | "-r", _] => {
            args.ids.is_empty()
        }
        ["capsule", "create", "--always-new" | "-a"] => args.ids.is_empty(),
        ["capsule", "create", _] => args.ids.len() == 1,
        [
            "capsule",
            "create",
            _,
            "--json" | "-j" | "--seeders-only" | "-s" | "--always-new" | "-a" | "--use-hash",
        ] => args.ids.len() == 1,
        ["capsule", "create", _, "--base-dir" | "-b" | "--root-base-dir" | "-r", _] => {
            args.ids.len() == 1
        }
        ["capsule", "create", _, _] => args.ids.len() == 2,
        ["capsule", "create", _, _, "--json" | "-j"] => args.ids.len() == 2,
        _ => false,
    }
}

fn supports_named_create_outside(argv: &[&str], args: &CreateArgs) -> bool {
    match argv {
        ["capsule", "create", "--id" | "-i" | "--package-manager" | "-p", _]
        | ["capsule", "create", "--id" | "-i" | "--package-manager" | "-p", _, "--json" | "-j"] => {
            args.ids.is_empty()
        }
        ["capsule", "create", _, "--id" | "-i" | "--package-manager" | "-p", _]
        | ["capsule", "create", "--id" | "-i" | "--package-manager" | "-p", _, _]
        | [
            "capsule",
            "create",
            _,
            "--id" | "-i" | "--package-manager" | "-p",
            _,
            "--json" | "-j",
        ]
        | [
            "capsule",
            "create",
            "--id" | "-i" | "--package-manager" | "-p",
            _,
            _,
            "--json" | "-j",
        ] => args.ids.len() == 1,
        _ => false,
    }
}

fn run_outside_failure(chalk: Chalk, label: &str, json: bool, error: &str) -> io::Result<Outcome> {
    if std::env::var_os("CI").is_some_and(|value| !value.is_empty()) {
        return Ok(Outcome::Declined("capsule CI error stack delegated".into()));
    }
    let output = workspace_command::loader_output(chalk, json);
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
