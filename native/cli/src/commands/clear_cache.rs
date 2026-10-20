//! Native `bit clear-cache` (`cc`) (`ClearCacheCmd` in `scopes/workspace/clear-cache/clear-cache-cmd.ts`).

#[cfg(test)]
mod tests;

use super::{Command, color::Chalk, workspace_command::format::Formatter};
use crate::{history::History, native::Outcome, workspace};
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
    if !parse_args(args) {
        return Ok(Outcome::Declined(
            "arguments outside the native `clear-cache` grammar".to_owned(),
        ));
    }
    let cwd = env::current_dir()?;
    let workspace_root = workspace::root(&cwd);
    let history = workspace_root.as_deref().map(|root| History::start(root, args));
    let cleared = clear_caches(&cwd, workspace_root.as_deref());
    let chalk = Chalk::detect(args);
    let report = format_report(&cleared, chalk);
    writeln!(io::stdout(), "{report}")?;
    if let Some(history) = history {
        history.end(true);
    }
    Ok(Outcome::Exit(ExitCode::SUCCESS))
}

fn parse_args(args: &[OsString]) -> bool {
    let Some(tokens) = args
        .iter()
        .skip(1)
        .map(|arg| arg.to_str())
        .collect::<Option<Vec<_>>>()
    else {
        return false;
    };
    tokens
        .into_iter()
        .all(|token| token == "--no-color")
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
