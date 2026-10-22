//! The commands implemented in Rust. A command is looked up by its name or
//! one of its aliases, exactly as the Node.js CLI spells them.

mod add;
mod aspect;
mod capsule;
mod cat;
mod cat_scope;
mod checkout;
mod ci;
mod clear_cache;
mod cli_cmd;
mod clone;
mod color;
mod component_issues;
mod config;
mod create;
mod debug_cat;
mod debug_load;
mod delete;
mod dependents;
mod deprecate;
mod deps;
mod details;
mod diff;
mod doctor;
mod eject;
mod eject_conf;
mod engine;
mod envs;
mod export;
mod file_history;
mod fork;
mod gc;
mod git;
mod globals;
mod ids;
mod import;
mod init;
mod insights;
mod install;
mod installation;
mod internalize;
mod inventory;
mod lane;
mod list;
mod local_only;
mod log;
mod login;
mod logout;
mod mcp_server;
mod merge;
mod mini_status;
mod move_paths;
mod new_cmd;
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
mod ripple;
mod scope_rename;
mod scope_set;
mod scope_trust;
mod script;
mod search;
mod set_peer;
mod snap;
mod snap_distance;
mod stash;
mod status;
mod switch;
mod system;
mod tag;
mod templates;
mod test_cmd;
#[cfg(test)]
mod test_support;
mod uninstall;
mod unuse_cmd;
mod use_cmd;
mod validate;
mod version;
mod version_history;
mod whoami;
mod workspace_command;
mod ws_config;

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
    capsule::COMMAND,
    cat::COMMAND,
    cat_scope::COMMAND,
    checkout::COMMAND,
    checkout::REVERT,
    ci::COMMAND,
    clear_cache::COMMAND,
    cli_cmd::COMMAND,
    clone::COMMAND,
    component_issues::COMMAND,
    config::COMMAND,
    create::COMMAND,
    debug_cat::CAT_COMPONENT,
    debug_cat::CAT_LANE,
    debug_cat::CAT_LANE_HISTORY,
    debug_cat::CAT_OBJECT,
    debug_cat::CAT_VERSION_HISTORY,
    debug_load::COMMAND,
    delete::COMMAND,
    dependents::COMMAND,
    deprecate::COMMAND,
    deprecate::UNDEPRECATE,
    deps::COMMAND,
    details::COMMAND,
    doctor::COMMAND,
    eject::COMMAND,
    eject_conf::COMMAND,
    envs::COMMAND,
    file_history::BLAME,
    fork::COMMAND,
    gc::COMMAND,
    diff::COMMAND,
    export::COMMAND,
    file_history::LOG_FILE,
    git::COMMAND,
    globals::COMMAND,
    import::FETCH,
    import::IMPORT,
    init::COMMAND,
    insights::COMMAND,
    install::COMMAND,
    internalize::COMMAND,
    lane::COMMAND,
    list::COMMAND,
    local_only::COMMAND,
    log::COMMAND,
    login::COMMAND,
    logout::COMMAND,
    mcp_server::COMMAND,
    merge::COMMAND,
    mini_status::COMMAND,
    move_paths::COMMAND,
    new_cmd::COMMAND,
    npmrc::COMMAND,
    pattern::COMMAND,
    recover::COMMAND,
    refactor::COMMAND,
    remote::COMMAND,
    remove::COMMAND,
    reset::COMMAND,
    rename::COMMAND,
    ripple::COMMAND,
    scope_rename::COMMAND,
    script::COMMAND,
    search::COMMAND,
    set_peer::SET_PEER,
    set_peer::UNSET_PEER,
    snap::COMMAND,
    snap_distance::COMMAND,
    stash::COMMAND,
    status::COMMAND,
    switch::COMMAND,
    system::COMMAND,
    tag::COMMAND,
    templates::COMMAND,
    test_cmd::COMMAND,
    uninstall::COMMAND,
    unuse_cmd::COMMAND,
    use_cmd::COMMAND,
    validate::COMMAND,
    version::COMMAND,
    version_history::COMMAND,
    whoami::COMMAND,
    ws_config::COMMAND,
];

pub fn find(name: &str) -> Option<&'static Command> {
    COMMANDS
        .iter()
        .find(|command| command.name == name || command.aliases.contains(&name))
}
