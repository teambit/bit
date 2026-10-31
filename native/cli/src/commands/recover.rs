//! Restore removed components through one retained import and bitmap publication owner.
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

pub const COMMAND: Command = Command { name: "recover", aliases: &[], run };
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
    let preview = match Batch::prepare(&root, options.pattern) {
        Ok(plan) => plan,
        Err(error) => return Ok(Outcome::Declined(format!("recover: {error}"))),
    };
    let mut linker = if needs_installation(&options, &preview) {
        ProjectedLinker::prepare_with_installation(&root, args)?
    } else {
        ProjectedLinker::prepare(&root)?
    };
    print!("{}", linker.take_stdout());
    workspace_command::execute_then(&root, args, "recover", |output| {
        execution::execute(&root, args, &options, &mut linker, output)
    })
}

fn needs_installation(options: &options::Options, preview: &Batch) -> bool {
    !options.skip_installation
        && (preview
            .import_ids()
            .iter()
            .any(|id| !id.trim().is_empty())
            || preview
                .probe_ids()
                .iter()
                .any(|id| !id.trim().is_empty()))
}
