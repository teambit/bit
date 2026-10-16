//! The commands implemented in Rust. A command is looked up by its name or
//! one of its aliases, exactly as the Node.js CLI spells them.

mod checkout;
mod color;
mod delete;
mod diff;
mod engine;
mod export;
mod file_history;
mod ids;
mod import;
mod install;
mod installation;
mod inventory;
mod lane;
mod list;
mod log;
mod merge;
mod mini_status;
mod patterns;
mod recovery;
mod remove;
mod reset;
mod snap;
mod status;
mod switch;
mod tag;
#[cfg(test)]
mod test_support;
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
    checkout::REVERT,
    delete::COMMAND,
    file_history::BLAME,
    diff::COMMAND,
    export::COMMAND,
    file_history::LOG_FILE,
    import::FETCH,
    import::IMPORT,
    install::COMMAND,
    lane::COMMAND,
    list::COMMAND,
    log::COMMAND,
    merge::COMMAND,
    mini_status::COMMAND,
    remove::COMMAND,
    reset::COMMAND,
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
