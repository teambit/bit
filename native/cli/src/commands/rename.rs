//! Component rename keeps identity, source and bitmap mutation in the native engine.
//!
//! Coordinates [`COMMAND`], [`preparation`], [`execution`], [`ast`], [`options`], and [`ProjectedLinker`] into [`Outcome`].
pub(super) mod execution;
pub(super) mod preparation;

mod ast;
mod options;

use super::{Command, add::ProjectedLinker, color::Chalk, workspace_command};
use crate::{native::Outcome, workspace};
use std::{env, ffi::OsString, io};

/// Descriptor for the native `bit rename` command (`RenameCmd`).
pub const COMMAND: Command = Command { name: "rename", aliases: &[], run };
/// Entry point for `bit rename` that prepares [`ProjectedLinker`] and runs [`execution::run`].
fn run(args: &[OsString]) -> io::Result<Outcome> {
    let Some(argv) = workspace_command::utf8_args(args) else {
        return Ok(Outcome::Declined("rename arguments are not UTF-8".into()));
    };
    let Some(options) = options::parse(&argv[1..]) else {
        return Ok(Outcome::Declined("outside native component rename grammar".into()));
    };
    let cwd = env::current_dir()?;
    let Some(root) = workspace::root(&cwd) else {
        return run_outside_workspace(&cwd, args, &options);
    };
    if let Err(error) = preparation::prepare(&root, &options)
        && (error.kind() != io::ErrorKind::InvalidInput || is_ci_active())
    {
        return Ok(Outcome::Declined(format!("component rename: {error}")));
    }
    let mut linker = match ProjectedLinker::prepare(&root) {
        Ok(linker) => linker,
        Err(error) if !super::engine::is_canonical(&error) => {
            return Ok(Outcome::Declined(format!("component rename: {error}")));
        }
        Err(error) => return Err(error),
    };
    let stdout = linker.take_stdout();
    if !stdout.is_empty() {
        print!("{stdout}");
    }
    let chalk = Chalk::detect(args);
    workspace_command::execute_then(&root, args, "rename", |output| {
        let prepared = preparation::prepare(&root, &options)?;
        execution::run(&root, prepared, &options, &mut linker, chalk, output)
    })
}

/// Returns `true` when `CI` is set to a non-empty, non-falsy environment value.
#[inline]
fn is_ci_active() -> bool {
    env::var_os("CI")
        .is_some_and(|value| {
            let text = value.to_string_lossy();
            let trimmed = text
                .trim()
                .trim_matches(['"', '\''])
                .trim();
            !trimmed.is_empty()
                && !trimmed.eq_ignore_ascii_case("0")
                && !trimmed.eq_ignore_ascii_case("false")
                && !trimmed.eq_ignore_ascii_case("no")
                && !trimmed.eq_ignore_ascii_case("off")
        })
}

/// Emits the failure report when `bit rename` is invoked outside a Bit workspace.
#[inline]
fn run_outside_workspace(
    cwd: &std::path::Path,
    args: &[OsString],
    options: &bit_object_import::component_rename::Options,
) -> io::Result<Outcome> {
    if is_ci_active() {
        return Ok(Outcome::Declined("component rename requires a workspace".into()));
    }
    let err = bit_object_import::component_rename::validate_name(options.target.trim())
        .err()
        .unwrap_or_else(|| {
            io::Error::other("Cannot read properties of undefined (reading 'resolveComponentId')")
        });
    workspace_command::execute_failure_scope(cwd, args, "rename", false, "", err)
}
