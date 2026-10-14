//! The commands implemented in Rust. A command is looked up by its name or
//! one of its aliases, exactly as the Node.js CLI spells them.

mod engine;
mod install;
mod inventory;
mod mini_status;
mod status;

use crate::native::Outcome;
use std::{ffi::OsString, io};

pub struct Command {
    pub name: &'static str,
    pub aliases: &'static [&'static str],
    /// Receives every argument after the executable, starting with the command name.
    pub run: fn(&[OsString]) -> io::Result<Outcome>,
}

pub const COMMANDS: &[Command] = &[install::COMMAND, mini_status::COMMAND, status::COMMAND];

pub fn find(name: &str) -> Option<&'static Command> {
    COMMANDS
        .iter()
        .find(|command| command.name == name || command.aliases.contains(&name))
}
