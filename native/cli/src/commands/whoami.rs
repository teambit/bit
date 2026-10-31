//! Native `bit whoami` (`WhoamiCmd` in `scopes/cloud/cloud/whoami.cmd.ts`).

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
    io::{self, Write},
    process::ExitCode,
    time::Duration,
};

pub const COMMAND: Command = Command { name: "whoami", aliases: &[], run };

fn run(args: &[OsString]) -> io::Result<Outcome> {
    let Some(cli_token) = parse_args(args) else {
        return Ok(Outcome::Declined("arguments outside the native `whoami` grammar".to_owned()));
    };
    let chalk = Chalk::detect(args);
    let cwd = env::current_dir()?;
    let history = workspace::root(&cwd).map(|root| History::start(&root, args));
    let output = workspace_command::loader_output(chalk, false);
    output.restart(r#"running command "whoami"..."#);
    let username = resolve_user(cli_token.as_deref())?;
    output.stop();
    let formatter = Formatter::new(chalk);
    let message = match username
        .as_deref()
        .map(str::trim)
        .filter(|user| !user.is_empty())
    {
        Some(user) => formatter.success_summary(&format!("logged in as {user}")),
        None => formatter.hint("not logged in. please run `bit login` to log in to bit cloud"),
    };
    writeln!(io::stdout(), "{message}")?;
    if let Some(history) = history {
        history.end(true);
    }
    Ok(Outcome::Exit(ExitCode::SUCCESS))
}

fn parse_args(args: &[OsString]) -> Option<Option<String>> {
    let mut token = None;
    let mut iter = args.iter().skip(1);
    while let Some(arg) = iter.next() {
        let str_arg = arg.to_str()?;
        if str_arg == "--" {
            return iter.next().is_none().then_some(token);
        }
        apply_whoami_arg(str_arg, &mut iter, &mut token)?;
    }
    Some(token)
}

fn apply_whoami_arg<'a>(
    str_arg: &str,
    iter: &mut impl Iterator<Item = &'a OsString>,
    token: &mut Option<String>,
) -> Option<()> {
    if matches!(str_arg, "--no-color" | "--no-color=true" | "--no-color=false") {
        return Some(());
    }
    if str_arg == "--token" {
        let next_arg = iter.next()?.to_str()?.trim();
        (!next_arg.is_empty() && !next_arg.starts_with('-')).then_some(())?;
        *token = Some(next_arg.to_owned());
        return Some(());
    }
    let tok = str_arg.strip_prefix("--token=")?.trim();
    (!tok.is_empty() && !tok.starts_with('-')).then_some(())?;
    *token = Some(tok.to_owned());
    Some(())
}

fn resolve_user(cli_token: Option<&str>) -> io::Result<Option<String>> {
    let global_val = bit_workspace_config::read_global_config(&global_config_dir())?;
    let mut global: bit_install::model::GlobalConfig =
        serde_json::from_value(global_val).unwrap_or_default();
    if let Some(tok) = cli_token {
        global.insert("user.token".to_owned(), serde_json::Value::String(tok.to_owned()));
    }
    if !global.contains_key("user.token") {
        return Ok(None);
    }
    let runtime = tokio::runtime::Builder::new_current_thread().enable_all().build()?;
    Ok(runtime.block_on(bit_install::engine::cloud_username(&global, Duration::from_secs(5))))
}
