//! The commands implemented in Rust. A command is looked up by its name or
//! one of its aliases, exactly as the Node.js CLI spells them.

mod add;
mod app_cmd;
mod artifacts_cmd;
mod aspect;
mod build_cmd;
mod capsule;
mod cat;
mod cat_scope;
mod check_types;
mod checkout;
mod ci;
mod clear_cache;
mod cli_cmd;
mod clone;
mod color;
mod compile_cmd;
mod completion_cmd;
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
mod format_cmd;
mod gc;
mod git;
mod globals;
mod graph_cmd;
mod ids;
mod import;
mod init;
mod insights;
mod install;
mod installation;
mod internalize;
mod inventory;
mod lane;
mod link_cmd;
mod lint_cmd;
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
mod pack_cmd;
mod pattern;
mod patterns;
mod preview_cmd;
mod publish_cmd;
mod recover;
mod recovery;
mod refactor;
mod remote;
mod remote_action;
mod remote_resolution;
mod remove;
mod rename;
mod reset;
mod resume_export;
mod ripple;
mod run_action;
mod run_cmd;
mod schema_cmd;
mod scope_rename;
mod scope_set;
mod scope_trust;
mod script;
mod search;
mod server_cmd;
mod set_peer;
mod show_cmd;
mod snap;
mod snap_distance;
mod start_cmd;
mod stash;
mod status;
mod switch;
mod system;
mod tag;
mod templates;
mod test_cmd;
#[cfg(test)]
mod test_support;
mod ui_build;
mod uninstall;
mod unuse_cmd;
mod update_cmd;
mod use_cmd;
mod validate;
mod version;
mod version_history;
mod watch_cmd;
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
    app_cmd::COMMAND,
    artifacts_cmd::COMMAND,
    aspect::COMMAND,
    build_cmd::COMMAND,
    capsule::COMMAND,
    cat::COMMAND,
    cat_scope::COMMAND,
    check_types::COMMAND,
    checkout::COMMAND,
    checkout::REVERT,
    ci::COMMAND,
    clear_cache::COMMAND,
    cli_cmd::COMMAND,
    clone::COMMAND,
    compile_cmd::COMMAND,
    completion_cmd::COMMAND,
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
    format_cmd::COMMAND,
    gc::COMMAND,
    diff::COMMAND,
    export::COMMAND,
    file_history::LOG_FILE,
    git::COMMAND,
    globals::COMMAND,
    graph_cmd::COMMAND,
    import::FETCH,
    import::IMPORT,
    init::COMMAND,
    insights::COMMAND,
    install::COMMAND,
    internalize::COMMAND,
    lane::COMMAND,
    link_cmd::COMMAND,
    lint_cmd::COMMAND,
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
    pack_cmd::COMMAND,
    pattern::COMMAND,
    preview_cmd::GENERATE_PREVIEW,
    preview_cmd::SERVE_PREVIEW,
    publish_cmd::COMMAND,
    recover::COMMAND,
    refactor::COMMAND,
    remote::COMMAND,
    remove::COMMAND,
    reset::COMMAND,
    resume_export::COMMAND,
    rename::COMMAND,
    ripple::COMMAND,
    run_action::COMMAND,
    run_cmd::COMMAND,
    schema_cmd::COMMAND,
    scope_rename::COMMAND,
    script::COMMAND,
    search::COMMAND,
    server_cmd::COMMAND,
    set_peer::SET_PEER,
    set_peer::UNSET_PEER,
    show_cmd::COMMAND,
    snap::COMMAND,
    snap_distance::COMMAND,
    start_cmd::COMMAND,
    stash::COMMAND,
    status::COMMAND,
    switch::COMMAND,
    system::COMMAND,
    tag::COMMAND,
    templates::COMMAND,
    test_cmd::COMMAND,
    ui_build::COMMAND,
    uninstall::COMMAND,
    unuse_cmd::COMMAND,
    update_cmd::COMMAND,
    use_cmd::COMMAND,
    validate::COMMAND,
    version::COMMAND,
    version_history::COMMAND,
    watch_cmd::COMMAND,
    deps::WHY,
    whoami::COMMAND,
    ws_config::COMMAND,
];

pub fn find(name: &str) -> Option<&'static Command> {
    let trimmed = name.trim();
    COMMANDS
        .iter()
        .find(|command| command.name == trimmed || command.aliases.contains(&trimmed))
}
