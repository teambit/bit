//! Component rename keeps identity, source and bitmap mutation in the native engine.
pub(super) mod execution;
pub(super) mod preparation;

mod ast;
mod options;

use super::{Command, add::ProjectedLinker, color::Chalk, workspace_command};
use crate::{native::Outcome, workspace};
use std::{env, ffi::OsString, io};

pub const COMMAND: Command = Command { name: "rename", aliases: &[], run };
fn run(args: &[OsString]) -> io::Result<Outcome> {
    let Some(argv) = workspace_command::utf8_args(args) else {
        return Ok(Outcome::Declined("rename arguments are not UTF-8".into()));
    };
    let Some(options) = options::parse(&argv[1..]) else {
        return Ok(Outcome::Declined("outside native component rename grammar".into()));
    };
    let Some(root) = workspace::root(&env::current_dir()?) else {
        return Ok(Outcome::Declined("component rename requires a workspace".into()));
    };
    if let Err(error) = preparation::prepare(&root, &options)
        && (error.kind() != io::ErrorKind::InvalidInput
            || env::var_os("CI").is_some_and(|value| !value.is_empty()))
    {
        return Ok(Outcome::Declined(format!("component rename: {error}")));
    }
    let mut linker = ProjectedLinker::prepare(&root)?;
    print!("{}", linker.take_stdout());
    let chalk = Chalk::detect(args);
    workspace_command::execute_then(&root, args, "rename", |output| {
        let prepared = preparation::prepare(&root, &options)?;
        execution::run(&root, prepared, &options, &mut linker, chalk, output)
    })
}
