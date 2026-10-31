//! Native `bit show <component-name>` (`scopes/component/component/show/show.cmd.ts`).

pub(crate) mod remote_show;

mod deps;
mod deps_policy;
mod help;
mod render;
#[cfg(test)]
mod tests;
mod workspace_show;

use super::{Command, workspace_command};
use crate::{native::Outcome, workspace};
use std::{env, ffi::OsString, io, path::Path};

pub const COMMAND: Command = Command { name: "show", aliases: &[], run };

const REMOTE_NO_HOST_ERR: &str = "error: the current directory is not a workspace nor a scope. the full \"bit show\" is not supported.\nto see the legacy bit show, please use \"--legacy\" flag";
const LOCAL_NO_HOST_ERR: &str = "Could not find a workspace or scope. Consider using --remote or run inside a valid workspace or scope.";

#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub(super) struct Options {
    pub id: String,
    pub json: bool,
    pub legacy: bool,
    pub remote: bool,
    pub browser: bool,
    pub compare: bool,
}

fn is_ci_active() -> bool {
    env::var_os("CI")
        .is_some_and(|val| {
            let text = val.to_string_lossy();
            let trimmed = text.trim();
            !trimmed.is_empty()
                && !trimmed.eq_ignore_ascii_case("0")
                && !trimmed.eq_ignore_ascii_case("false")
        })
}

fn run(args: &[OsString]) -> io::Result<Outcome> {
    let Some(argv) = workspace_command::utf8_args(args) else {
        return Ok(Outcome::Declined("show arguments are not UTF-8".into()));
    };
    if let Some(outcome) = help::try_run(args, &argv[1..])? {
        return Ok(outcome);
    }
    let Some(options) = parse_options(&argv[1..]) else {
        return Ok(Outcome::Declined("outside native show grammar".into()));
    };
    if is_ci_active() {
        return Ok(Outcome::Declined("CI show delegated".into()));
    }
    let cwd = env::current_dir()?;
    if let Some(err) = missing_host_error(&cwd, &options) {
        if options.json {
            return workspace_command::execute_failure_scope(
                &cwd,
                args,
                "show",
                true,
                "",
                io::Error::other(err),
            );
        }
        return workspace_command::execute_without_loader_scope(&cwd, args, "show", |_| {
            Err(io::Error::other(err))
        });
    }
    let outcome_opt = if options.remote {
        remote_show::try_run(&cwd, args, &options)?
    } else {
        workspace_show::try_run(&cwd, args, &options)?
    };
    if let Some(outcome) = outcome_opt {
        return Ok(outcome);
    }
    Ok(Outcome::Declined("show execution delegated".into()))
}

pub(super) fn missing_host_error(cwd: &Path, options: &Options) -> Option<&'static str> {
    if options.legacy
        || workspace::root(cwd).is_some()
        || cwd
            .ancestors()
            .any(|dir| {
                dir.join("scope.json").is_file()
                    || dir.join(".bit").is_dir()
                    || dir.join(".git/bit").is_dir()
            })
    {
        return None;
    }
    if options.remote { Some(REMOTE_NO_HOST_ERR) } else { Some(LOCAL_NO_HOST_ERR) }
}

pub(super) fn parse_options(args: &[&str]) -> Option<Options> {
    let mut id = None;
    let mut options = Options::default();
    let mut iter = args.iter().copied();
    while let Some(arg) = iter.next() {
        match arg {
            "--" => {
                consume_trailing_show_id(iter, &mut id)?;
                break;
            }
            "--no-color" => return None,
            "-j" | "--json" | "--json=true" => options.json = true,
            "--json=false" => options.json = false,
            "-l" | "--legacy" | "--legacy=true" => options.legacy = true,
            "--legacy=false" => options.legacy = false,
            "-r" | "--remote" | "--remote=true" => options.remote = true,
            "--remote=false" => options.remote = false,
            "-b" | "--browser" | "--browser=true" => options.browser = true,
            "--browser=false" => options.browser = false,
            "-c" | "--compare" | "--compare=true" => options.compare = true,
            "--compare=false" => options.compare = false,
            short if apply_short_bundle(short, &mut options) => {}
            val if !val.starts_with('-') && !val.trim().is_empty() && id.is_none() => {
                id = Some(val.trim().to_owned());
            }
            _ => return None,
        }
    }
    options.id = id?;
    Some(options)
}

fn consume_trailing_show_id<'a>(
    iter: impl Iterator<Item = &'a str>,
    id: &mut Option<String>,
) -> Option<()> {
    for val in iter {
        let val = val.trim();
        (!val.is_empty() && !val.starts_with('-') && id.replace(val.to_owned()).is_none())
            .then_some(())?;
    }
    Some(())
}

fn apply_short_bundle(arg: &str, options: &mut Options) -> bool {
    let arg = arg.trim();
    if !arg.starts_with('-')
        || arg.starts_with("--")
        || arg.len() <= 2
        || !arg[1..]
            .chars()
            .all(|ch| matches!(ch, 'j' | 'l' | 'r' | 'b' | 'c'))
    {
        return false;
    }
    for ch in arg[1..].chars() {
        match ch {
            'j' => options.json = true,
            'l' => options.legacy = true,
            'r' => options.remote = true,
            'b' => options.browser = true,
            'c' => options.compare = true,
            _ => unreachable!(),
        }
    }
    true
}

fn render_remote_outcome(
    cwd: &Path,
    args: &[OsString],
    options: &Options,
    loaded: &workspace_show::LoadedComponent,
) -> io::Result<Option<Outcome>> {
    let report = format_remote_report(options, loaded)?;
    let outcome = if let Some(root) = workspace::root(cwd) {
        if options.json {
            workspace_command::execute_json(&root, args, "show", |_| Ok(report))?
        } else {
            workspace_command::execute_then(&root, args, "show", |_| Ok(report))?
        }
    } else if options.json {
        workspace_command::execute_json_scope(cwd, args, "show", |_| Ok(report))?
    } else {
        workspace_command::execute_with_scope(cwd, args, "show", &report)?
    };
    Ok(Some(outcome))
}

fn format_remote_report(
    options: &Options,
    loaded: &workspace_show::LoadedComponent,
) -> io::Result<workspace_command::results::Report> {
    let data = if options.json {
        let value =
            if options.legacy { render::legacy_json(loaded) } else { render::harmony_json(loaded) };
        serde_json::to_string_pretty(&value)?
    } else {
        render::text_report(loaded)
    };
    Ok(workspace_command::results::Report { data, code: 0, details: None })
}
