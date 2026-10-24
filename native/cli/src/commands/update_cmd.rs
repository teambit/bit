//! Native `bit update [package-patterns...]` (`scopes/workspace/install/update.cmd.tsx`, alias `up`).

mod apply;
mod collect;
mod resolve;
#[cfg(test)]
mod tests;

use super::{
    Command,
    script::active_component_count,
    workspace_command::{self, results::Report},
};
use crate::{native::Outcome, workspace};
use bit_object_import::parse_jsonc;
use serde_json::Value;
use std::{
    env,
    ffi::OsString,
    fs,
    io::{self, Write},
    path::Path,
    process::ExitCode,
};

pub const COMMAND: Command = Command { name: "update", aliases: &["up"], run };

const NO_DEPS_FOUND_MSG: &str = "No dependencies found that match the patterns";
const NO_OUTDATED_MSG: &str = "No outdated dependencies found";

#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub(super) struct Options {
    pub patterns: Vec<String>,
    pub yes: bool,
    pub patch: bool,
    pub minor: bool,
    pub major: bool,
    pub semver: bool,
}

fn run(args: &[OsString]) -> io::Result<Outcome> {
    let Some(argv) = workspace_command::utf8_args(args) else {
        return Ok(Outcome::Declined("update arguments are not UTF-8".into()));
    };
    let Some(options) = parse_options(&argv[1..]) else {
        return Ok(Outcome::Declined("outside native update grammar".into()));
    };
    if env::var_os("CI").is_some_and(|val| !val.is_empty()) {
        return Ok(Outcome::Declined("CI update delegated".into()));
    }
    let cwd = env::current_dir()?;
    let Some(root) = workspace::root(&cwd) else {
        return run_outside_workspace(&options);
    };
    if has_no_workspace_dependencies(&root).unwrap_or(false) {
        return workspace_command::execute_then(&root, args, "update", |output| {
            output.failure(NO_DEPS_FOUND_MSG);
            Ok(Report { data: String::new(), code: 0, details: None })
        });
    }
    if !options.yes {
        return Ok(Outcome::Declined("interactive update delegated".into()));
    }
    execute_update(&root, args, &options)
}

fn run_outside_workspace(options: &Options) -> io::Result<Outcome> {
    if !options.yes {
        return Ok(Outcome::Declined("update outside workspace delegated".into()));
    }
    let mut stdout = io::stdout().lock();
    writeln!(stdout, "{NO_DEPS_FOUND_MSG}")?;
    stdout.flush()?;
    Ok(Outcome::Exit(ExitCode::SUCCESS))
}

fn execute_update(root: &Path, args: &[OsString], options: &Options) -> io::Result<Outcome> {
    let collected = match collect::collect_candidates(root, &options.patterns) {
        Ok(val) => val,
        Err(reason) => return Ok(Outcome::Declined(format!("update: {reason}"))),
    };
    if collected.candidates.is_empty() {
        return workspace_command::execute_then(root, args, "update", |output| {
            output.failure(NO_DEPS_FOUND_MSG);
            Ok(Report { data: String::new(), code: 0, details: None })
        });
    }
    let updates = resolve::resolve_updates(
        root,
        &collected.candidates,
        options,
        collected.save_prefix.as_deref(),
    );
    if updates.is_empty() {
        return workspace_command::execute_then(root, args, "update", |output| {
            output.success(NO_OUTDATED_MSG, None);
            Ok(Report { data: String::new(), code: 0, details: None })
        });
    }
    let root_buf = root.to_path_buf();
    workspace_command::execute_then(root, args, "update", move |output| {
        apply::apply_updates(&root_buf, &updates)?;
        output.success("successfully updated dependencies", None);
        Ok(Report { data: String::new(), code: 0, details: None })
    })
}

pub(super) fn has_no_workspace_dependencies(root: &Path) -> io::Result<bool> {
    let ws_config = parse_jsonc(&fs::read(root.join("workspace.jsonc"))?)?;
    if ws_config["teambit.workspace/workspace"]["bitmapAutoSync"] == true {
        return Ok(false);
    }
    let policy = &ws_config["teambit.dependencies/dependency-resolver"]["policy"];
    if non_empty_object(&policy["dependencies"]) || non_empty_object(&policy["peerDependencies"]) {
        return Ok(false);
    }
    if non_empty_object(&ws_config["teambit.workspace/variants"]) {
        return Ok(false);
    }
    let bitmap = parse_jsonc(&fs::read(root.join(".bitmap"))?)?;
    Ok(active_component_count(&bitmap) == 0)
}

fn non_empty_object(val: &Value) -> bool {
    val.as_object()
        .is_some_and(|obj| !obj.is_empty())
}

pub(super) fn parse_options(args: &[&str]) -> Option<Options> {
    let mut options = Options::default();
    for &arg in args {
        match arg {
            "--no-color" => {}
            "-y" | "--yes" => options.yes = true,
            "--patch" => options.patch = true,
            "--minor" => options.minor = true,
            "--major" | "--latest" => options.major = true,
            "--semver" => options.semver = true,
            val if !val.starts_with('-') && !val.is_empty() => {
                push_patterns(&mut options.patterns, val);
            }
            _ => return None,
        }
    }
    Some(options)
}

fn push_patterns(patterns: &mut Vec<String>, raw: &str) {
    for part in raw.split(',') {
        let trimmed = part.trim();
        if !trimmed.is_empty() {
            patterns.push(trimmed.to_owned());
        }
    }
}
