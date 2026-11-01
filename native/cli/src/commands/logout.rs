//! Native `bit logout` (`LogoutCmd` in `scopes/cloud/cloud/logout.cmd.ts`).
//!
//! Clears stored cloud authentication tokens and formats confirmation via [`Formatter`].

#[cfg(test)]
mod tests;

use super::{
    Command,
    color::Chalk,
    workspace_command::{self, format::Formatter},
};
use crate::{history::History, native::Outcome, workspace};
use bit_workspace_config::global_config_dir;
use std::{
    env,
    ffi::OsString,
    fs,
    io::{self, Write},
    path::Path,
    process::ExitCode,
};

pub const COMMAND: Command = Command { name: "logout", aliases: &[], run };

fn run(args: &[OsString]) -> io::Result<Outcome> {
    if !valid_args(args) {
        return Ok(Outcome::Declined("arguments outside the native `logout` grammar".to_owned()));
    }
    let chalk = Chalk::detect(args);
    let cwd = env::current_dir()?;
    let history = workspace::root(&cwd).map(|root| History::start(&root, args));
    let output = workspace_command::loader_output(chalk, false);
    output.restart(r#"running command "logout"..."#);
    clear_auth_config(&global_config_dir())?;
    output.stop();
    let message = Formatter::new(chalk).success_summary("logged out successfully.");
    let mut stdout = io::stdout().lock();
    writeln!(stdout, "{message}")?;
    stdout.flush()?;
    if let Some(history) = history {
        history.end(true);
    }
    Ok(Outcome::Exit(ExitCode::SUCCESS))
}

#[inline]
fn valid_args(args: &[OsString]) -> bool {
    if args.is_empty() {
        return false;
    }
    let mut iter = args.iter().skip(1);
    while let Some(arg) = iter.next() {
        let Some(str_arg) = arg.to_str().map(str::trim) else {
            return false;
        };
        if str_arg == "--" {
            return iter.all(|tail| {
                tail.to_str()
                    .map(str::trim)
                    .is_some_and(str::is_empty)
            });
        }
        if !matches!(
            str_arg,
            "--no-color"
                | "--no-color=true"
                | "--no-color=false"
                | "--color"
                | "--color=true"
                | "--color=false"
                | "--color=always"
                | "--color=never",
        ) {
            return false;
        }
    }
    true
}

#[inline]
fn clear_auth_config(global_dir: &Path) -> io::Result<()> {
    let path = global_dir.join("config.json");
    if !path.is_file() {
        return Ok(());
    }
    let Ok(content) = fs::read(&path) else {
        return Ok(());
    };
    let Ok(mut val) = bit_object_import::parse_jsonc(&content) else {
        return Ok(());
    };
    let Some(obj) = val.as_object_mut() else {
        return Ok(());
    };
    let removed_token = obj.remove("user.token").is_some();
    let removed_name = obj.remove("user.name").is_some();
    if removed_token || removed_name {
        let mut bytes = serde_json::to_vec_pretty(&val)?;
        bytes.push(b'\n');
        fs::write(&path, bytes)?;
    }
    Ok(())
}
