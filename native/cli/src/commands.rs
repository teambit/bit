//! The commands implemented in Rust. A command is looked up by its name or
//! one of its aliases, exactly as the Node.js CLI spells them.

mod add;
mod aspect;
mod cat;
mod cat_scope;
mod checkout;
mod clear_cache;
mod color;
mod component_issues;
mod config;
mod debug_cat;
mod delete;
mod deprecate;
mod details;
mod diff;
mod doctor;
mod eject_conf;
mod engine;
mod envs;
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
mod local_only;
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
mod search;
mod snap;
mod snap_distance;
mod stash;
mod status;
mod switch;
mod system;
mod tag;
#[cfg(test)]
mod test_support;
mod uninstall;
mod unuse_cmd;
mod use_cmd;
mod version;
mod version_history;
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
    aspect::COMMAND,
    cat::COMMAND,
    cat_scope::COMMAND,
    checkout::COMMAND,
    checkout::REVERT,
    clear_cache::COMMAND,
    component_issues::COMMAND,
    config::COMMAND,
    debug_cat::CAT_COMPONENT,
    debug_cat::CAT_LANE,
    debug_cat::CAT_LANE_HISTORY,
    debug_cat::CAT_OBJECT,
    debug_cat::CAT_VERSION_HISTORY,
    delete::COMMAND,
    deprecate::COMMAND,
    deprecate::UNDEPRECATE,
    details::COMMAND,
    doctor::COMMAND,
    eject_conf::COMMAND,
    envs::COMMAND,
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
    local_only::COMMAND,
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
    search::COMMAND,
    snap::COMMAND,
    snap_distance::COMMAND,
    stash::COMMAND,
    status::COMMAND,
    switch::COMMAND,
    system::COMMAND,
    tag::COMMAND,
    uninstall::COMMAND,
    unuse_cmd::COMMAND,
    use_cmd::COMMAND,
    version::COMMAND,
    version_history::COMMAND,
    whoami::COMMAND,
];

pub fn find(name: &str) -> Option<&'static Command> {
    COMMANDS
        .iter()
        .find(|command| command.name == name || command.aliases.contains(&name))
}
