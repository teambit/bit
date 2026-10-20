//! The commands implemented in Rust. A command is looked up by its name or
//! one of its aliases, exactly as the Node.js CLI spells them.

mod add;
mod cat;
mod checkout;
mod color;
mod config;
mod delete;
mod deprecate;
mod details;
mod diff;
mod doctor;
mod engine;
mod export;
mod file_history;
mod fork;
mod git;
mod globals;
mod ids;
mod import;
mod init;
mod install;
mod installation;
mod inventory;
mod lane;
mod list;
mod log;
mod logout;
mod merge;
mod mini_status;
mod move_paths;
mod npmrc;
mod pattern;
mod patterns;
mod recover;
mod recovery;
mod refactor;
mod remote;
mod remote_resolution;
mod remove;
mod rename;
mod reset;
mod scope_rename;
mod scope_set;
mod scope_trust;
mod snap;
mod stash;
mod status;
mod switch;
mod system;
mod tag;
#[cfg(test)]
mod test_support;
mod unuse_cmd;
mod use_cmd;
mod version;
mod whoami;
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
    add::COMMAND,
    cat::COMMAND,
    checkout::COMMAND,
    checkout::REVERT,
    config::COMMAND,
    delete::COMMAND,
    deprecate::COMMAND,
    deprecate::UNDEPRECATE,
    details::COMMAND,
    doctor::COMMAND,
    file_history::BLAME,
    fork::COMMAND,
    diff::COMMAND,
    export::COMMAND,
    file_history::LOG_FILE,
    git::COMMAND,
    globals::COMMAND,
    import::FETCH,
    import::IMPORT,
    init::COMMAND,
    install::COMMAND,
    lane::COMMAND,
    list::COMMAND,
    log::COMMAND,
    logout::COMMAND,
    merge::COMMAND,
    mini_status::COMMAND,
    move_paths::COMMAND,
    npmrc::COMMAND,
    pattern::COMMAND,
    recover::COMMAND,
    refactor::COMMAND,
    remote::COMMAND,
    remove::COMMAND,
    reset::COMMAND,
    rename::COMMAND,
    scope_rename::COMMAND,
    snap::COMMAND,
    stash::COMMAND,
    status::COMMAND,
    switch::COMMAND,
    system::COMMAND,
    tag::COMMAND,
    unuse_cmd::COMMAND,
    use_cmd::COMMAND,
    version::COMMAND,
    whoami::COMMAND,
];

pub fn find(name: &str) -> Option<&'static Command> {
    COMMANDS
        .iter()
        .find(|command| command.name == name || command.aliases.contains(&name))
}
