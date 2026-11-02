//! Restore removed components through one retained import and bitmap publication owner.
//!
//! Coordinates [`COMMAND`], [`options`], [`execution`], [`Batch`], and [`ProjectedLinker`] to produce a [`Report`].
mod execution;
mod options;

use super::{
    add::ProjectedLinker,
    color::Chalk,
    workspace_command::{self, format::Formatter, results::Report},
};
use crate::{commands::Command, native::Outcome};
use bit_object_import::component_recover::Batch;
use std::{ffi::OsString, io};

/// Descriptor for the native `bit recover` command.
pub const COMMAND: Command = Command { name: "recover", aliases: &[], run };
/// Entry point for `bit recover` that prepares the recovery [`Batch`] and runs [`execution::execute`].
fn run(args: &[OsString]) -> io::Result<Outcome> {
    let Some(argv) = workspace_command::utf8_args(args) else {
        return Ok(Outcome::Declined("arguments are not UTF-8".into()));
    };
    let Some(options) = options::parse(&argv[1..]) else {
        return Ok(Outcome::Declined("outside the native recover grammar".into()));
    };
    let root = match workspace_command::workspace_or_fail(args, "recover")? {
        Ok(root) => root,
        Err(outcome) => return Ok(outcome),
    };
    let mut preview = match Batch::prepare(&root, options.pattern.trim()) {
        Ok(plan) => plan,
        Err(error) => return Ok(Outcome::Declined(format!("recover: {error}"))),
    };
    let mut linker = if needs_installation(&options, &mut preview) {
        ProjectedLinker::prepare_with_installation(&root, args)?
    } else {
        ProjectedLinker::prepare(&root)?
    };
    let stdout = linker.take_stdout();
    if !stdout.is_empty() {
        print!("{stdout}");
    }
    workspace_command::execute_then(&root, args, "recover", |output| {
        execution::execute(&root, args, &options, &mut linker, output)
    })
}

/// Returns whether `preview` requires dependency installation after component recovery.
#[inline]
fn needs_installation(options: &options::Options, preview: &mut Batch) -> bool {
    !options.skip_installation
        && (has_non_empty(&preview.import_ids())
            || has_non_empty(&preview.hydration_ids())
            || has_non_empty(&preview.probe_ids())
            || preview.scope_import_ids().is_ok_and(|ids| has_non_empty(&ids)))
}

/// Returns whether `ids` contains at least one non-whitespace component identifier.
#[inline]
fn has_non_empty(ids: &[String]) -> bool {
    ids.iter()
        .any(|id| !id.trim().is_empty())
}
