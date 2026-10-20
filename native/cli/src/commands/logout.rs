//! Native `bit logout` (`LogoutCmd` in `scopes/cloud/cloud/logout.cmd.ts`).

#[cfg(test)]
mod tests;

use super::{
    Command,
    color::Chalk,
    workspace_command::{self, format::Formatter},
};
use crate::{history::History, native::Outcome, workspace};
use bit_workspace_config::global_config_dir;
use serde_json::Value;
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
    writeln!(io::stdout(), "{message}")?;
    if let Some(history) = history {
        history.end(true);
    }
    Ok(Outcome::Exit(ExitCode::SUCCESS))
}

fn valid_args(args: &[OsString]) -> bool {
    for arg in args.iter().skip(1) {
        let Some(str_arg) = arg.to_str() else {
            return false;
        };
        if str_arg != "--no-color" {
            return false;
        }
    }
    true
}

fn clear_auth_config(global_dir: &Path) -> io::Result<()> {
    let path = global_dir.join("config.json");
    if !path.is_file() {
        return Ok(());
    }
    let Ok(content) = fs::read_to_string(&path) else {
        return Ok(());
    };
    let Ok(mut val) = serde_json::from_str::<Value>(&content) else {
        return Ok(());
    };
    let Some(obj) = val.as_object_mut() else {
        return Ok(());
    };
    let removed_token = obj.remove("user.token").is_some();
    let removed_name = obj.remove("user.name").is_some();
    if removed_token || removed_name {
        let bytes = serde_json::to_vec_pretty(&val)?;
        fs::write(&path, bytes)?;
    }
    Ok(())
}
