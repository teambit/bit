//! The commands implemented in Rust. A command is looked up by its name or
//! one of its aliases, exactly as the Node.js CLI spells them.

mod checkout;
mod color;
mod diff;
mod engine;
mod export;
mod ids;
mod import;
mod install;
mod inventory;
mod lane;
mod list;
mod merge;
mod mini_status;
mod patterns;
mod snap;
mod status;
mod switch;
mod tag;
mod workspace_command;

use crate::native::Outcome;
use std::{ffi::OsString, io};

pub struct Command {
    pub name: &'static str,
    pub aliases: &'static [&'static str],
    /// Receives every argument after the executable, starting with the command name.
    pub run: fn(&[OsString]) -> io::Result<Outcome>,
}

pub const COMMANDS: &[Command] = &[
    checkout::COMMAND,
    diff::COMMAND,
    export::COMMAND,
    import::FETCH,
    import::IMPORT,
    install::COMMAND,
    lane::COMMAND,
    list::COMMAND,
    merge::COMMAND,
    mini_status::COMMAND,
    snap::COMMAND,
    status::COMMAND,
    switch::COMMAND,
    tag::COMMAND,
];

pub fn find(name: &str) -> Option<&'static Command> {
    COMMANDS
        .iter()
        .find(|command| command.name == name || command.aliases.contains(&name))
}
