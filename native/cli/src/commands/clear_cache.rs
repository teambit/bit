//! Native `bit clear-cache` (`cc`) (`ClearCacheCmd` in `scopes/workspace/clear-cache/clear-cache-cmd.ts`).

#[cfg(test)]
mod tests;

use super::{
    Command,
    color::Chalk,
    remote_action,
    workspace_command::{self, format::Formatter},
};
use crate::{history::History, native::Outcome, workspace};
use serde_json::{Value, json};
use std::{
    env,
    ffi::OsString,
    fs,
    io::{self, Write},
    path::Path,
    process::ExitCode,
};

pub const COMMAND: Command = Command { name: "clear-cache", aliases: &["cc"], run };

fn run(args: &[OsString]) -> io::Result<Outcome> {
    let Some(remote) = parse_args(args) else {
        return Ok(Outcome::Declined(
            "arguments outside the native `clear-cache` grammar".to_owned(),
        ));
    };
    let cwd = env::current_dir()?;
    if let Some(remote) = remote {
        return run_remote(&cwd, args, &remote);
    }
    let workspace_root = workspace::root(&cwd);
    let history = workspace_root.as_deref().map(|root| History::unstarted(root, args));
    let cleared = clear_caches(&cwd, workspace_root.as_deref());
    let chalk = Chalk::detect(args);
    let report = format_report(&cleared, chalk);
    writeln!(io::stdout(), "{report}")?;
    if let Some(history) = history {
        history.end(true);
    }
    Ok(Outcome::Exit(ExitCode::SUCCESS))
}

fn run_remote(cwd: &Path, args: &[OsString], remote: &str) -> io::Result<Outcome> {
    let remote = remote.trim();
    let Ok(Some(plan)) = remote_action::prepare(cwd, remote, true, false) else {
        return Ok(Outcome::Declined(
            "remote cache clearing requires a configured HTTP remote".to_owned(),
        ));
    };
    let history = workspace::root(cwd).map(|root| History::unstarted(&root, args));
    let chalk = Chalk::detect(args);
    let result = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .and_then(|runtime| runtime.block_on(plan.action("ClearCacheAction", &json!({}))));
    let value = match result {
        Ok(value) => value,
        Err(error) => {
            if let Some(history) = history {
                history.end(false);
            }
            workspace_command::print_error(&error, chalk);
            return Ok(Outcome::Exit(ExitCode::FAILURE));
        }
    };
    let report = format_remote_report(remote, &value, chalk);
    writeln!(io::stdout(), "{report}")?;
    if let Some(history) = history {
        history.end(true);
    }
    Ok(Outcome::Exit(ExitCode::SUCCESS))
}

fn parse_args(args: &[OsString]) -> Option<Option<String>> {
    let tokens = args
        .iter()
        .skip(1)
        .map(|arg| arg.to_str())
        .collect::<Option<Vec<_>>>()?;
    let mut remote = None;
    let mut index = 0;
    while index < tokens.len() {
        if tokens[index] == "--" {
            return (index + 1 == tokens.len()).then_some(remote);
        }
        apply_token(&tokens, &mut index, &mut remote)?;
        index += 1;
    }
    Some(remote)
}

fn apply_token(tokens: &[&str], index: &mut usize, remote: &mut Option<String>) -> Option<()> {
    match tokens[*index] {
        "--no-color" | "--no-color=true" | "--no-color=false" => Some(()),
        "-r" | "--remote" => {
            *index += 1;
            let value = tokens.get(*index)?.trim();
            (!value.is_empty() && !value.starts_with('-')).then(|| *remote = Some(value.to_owned()))
        }
        token => {
            let value = token
                .strip_prefix("--remote=")
                .or_else(|| token.strip_prefix("-r="))?
                .trim();
            (!value.is_empty() && !value.starts_with('-')).then(|| *remote = Some(value.to_owned()))
        }
    }
}

fn clear_caches(cwd: &Path, workspace_root: Option<&Path>) -> Vec<&'static str> {
    let mut cleared = Vec::new();
    if let Some(root) = workspace_root {
        let scope = workspace::scope_path(root);
        if scope.is_dir() {
            let _ = fs::remove_dir_all(scope.join("cache").join("components"));
            cleared.push("components cache on the filesystem");
            let _ = fs::remove_file(scope.join("index.json"));
            cleared.push("scope-index file");
        }
        return cleared;
    }
    if let Some(scope) = cwd
        .ancestors()
        .find(|path| path.join("scope.json").is_file())
    {
        let _ = fs::remove_file(scope.join("index.json"));
        cleared.push("scope-index file");
    }
    cleared
}

fn format_report(cleared: &[&str], chalk: Chalk) -> String {
    if cleared.is_empty() {
        return String::new();
    }
    let formatter = Formatter::new(chalk);
    let summary = formatter.success_summary("caches cleared");
    let items = cleared
        .iter()
        .map(|item| formatter.item(item))
        .collect::<Vec<_>>()
        .join("\n");
    format!("{summary}\n{items}")
}

fn format_remote_report(remote: &str, result: &Value, chalk: Chalk) -> String {
    let formatter = Formatter::new(chalk);
    if is_truthy(result) {
        formatter.success_summary(&format!(r#"cleaned the cache of "{remote}""#))
    } else {
        format!(r#"{} failed cleaning the cache of "{remote}""#, formatter.error_symbol())
    }
}

fn is_truthy(value: &Value) -> bool {
    match value {
        Value::Null | Value::Bool(false) => false,
        Value::Number(num) => num.as_f64() != Some(0.0),
        Value::String(text) => !text.trim().is_empty(),
        Value::Bool(true) | Value::Array(_) | Value::Object(_) => true,
    }
}
