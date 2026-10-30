//! Native `bit uninstall` (`docs/rust-cli.md`): removes specified packages from
//! `workspace.jsonc` dependency policy and runs install to update `node_modules`.

#[cfg(test)]
mod tests;

use super::{
    Command,
    install::{self, Input, Terminal},
    workspace_command,
};
use crate::{
    discovery::{self, Target},
    history::History,
    host::Host,
    native::Outcome,
    workspace,
};
use bit_install::Outcome as Installed;
use std::{
    env,
    ffi::OsString,
    io,
    path::{Path, PathBuf},
    process::ExitCode,
    sync::Arc,
};

pub const COMMAND: Command = Command { name: "uninstall", aliases: &["un"], run };

fn run(args: &[OsString]) -> io::Result<Outcome> {
    let Prepared { packages, cli, cwd, root } = match prepare(args)? {
        Ok(prepared) => prepared,
        Err(reason) => return Ok(Outcome::Declined(reason)),
    };
    if super::installation::Installer::needs_canonical(&root) {
        return Ok(Outcome::Declined(
            "configured installation callbacks use InstallMain.install".into(),
        ));
    }
    update_workspace_policy(&root, &packages)?;
    let terminal = Terminal::detect(&["uninstall".to_string()]);
    let host = Arc::new(Host::new(cli, root.clone(), terminal.color));
    let info = match install::host_info(&host, &terminal) {
        Ok(info) => info,
        Err(error) => return Ok(Outcome::Declined(format!("JavaScript host: {error}"))),
    };
    let history = History::start(&root, args);
    let options =
        Box::new(bit_install::InstallOptions { external_prompt: true, ..Default::default() });
    match install::run_install(cwd, Input::Options(options), info, host)? {
        Ok(Installed::Installed(_) | Installed::Skipped) => {
            history.end(true);
            Ok(Outcome::Exit(ExitCode::SUCCESS))
        }
        Ok(Installed::Help) => Ok(Outcome::Declined("--help".to_string())),
        Ok(Installed::Unsupported) => Ok(Outcome::Declined("unsupported workspace".to_string())),
        Err(error) => {
            history.end(false);
            eprintln!("{}", terminal.red(&error.to_string()));
            Ok(Outcome::Exit(ExitCode::FAILURE))
        }
    }
}

struct Prepared {
    packages: Vec<String>,
    cli: discovery::NodeCli,
    cwd: PathBuf,
    root: PathBuf,
}

fn prepare(args: &[OsString]) -> io::Result<Result<Prepared, String>> {
    let Some(argv) = parse_arguments(args) else {
        return Ok(Err("arguments are not UTF-8".to_string()));
    };
    if argv
        .iter()
        .any(|arg| arg == "--help" || arg == "-h")
    {
        return Ok(Err("--help".to_string()));
    }
    if let Some(flag) = argv
        .iter()
        .find(|arg| arg.starts_with('-'))
    {
        return Ok(Err(format!("unrecognized option: {flag}")));
    }
    let Target::Entry(cli) = discovery::find()? else {
        return Ok(Err("the Node.js CLI is only reachable as a wrapper".to_string()));
    };
    if cli.bit_dir.is_none() {
        return Ok(Err("the entry is not inside an @teambit/bit package".to_string()));
    }
    let cwd = env::current_dir()?;
    let Some(root) = workspace::root(&cwd) else {
        return Ok(Err("not inside a workspace".to_string()));
    };
    Ok(Ok(Prepared { packages: argv, cli, cwd, root }))
}

fn parse_arguments(args: &[OsString]) -> Option<Vec<String>> {
    let mut packages = Vec::with_capacity(args.len().saturating_sub(1));
    for arg in args.iter().skip(1) {
        let string = arg
            .to_str()
            .filter(|text| !text.is_empty())?;
        if string != "--no-color" {
            packages.push(string.to_owned());
        }
    }
    Some(packages)
}

fn update_workspace_policy(root: &Path, packages: &[String]) -> io::Result<()> {
    if packages.is_empty() {
        return Ok(());
    }
    let to_remove = packages.to_vec();
    bit_install::command::edit_workspace_config(
        root,
        &workspace::scope_path(root),
        &workspace_command::file_id(),
        "uninstall dependencies",
        move |document| {
            bit_install::command::remove_root_policy_entries(document, &to_remove);
        },
    )
}
