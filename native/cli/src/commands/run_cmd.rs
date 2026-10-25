//! Native `bit run [app-name]` (`scopes/harmony/application/run.cmd.tsx`).

#[cfg(test)]
mod tests;

use super::{
    Command,
    app_cmd::{is_empty_app_workspace, run_missing_app, standard_nonapp_component_count},
    workspace_command,
};
use crate::{native::Outcome, workspace};
use std::{env, ffi::OsString, io};

pub const COMMAND: Command = Command { name: "run", aliases: &[], run };

#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub(super) struct Options {
    pub app_name: Option<String>,
    pub dev: bool,
    pub port: Option<String>,
    pub verbose: bool,
    pub watch: bool,
    pub no_browser: bool,
    pub args: Option<String>,
}

fn run(args: &[OsString]) -> io::Result<Outcome> {
    let Some(argv) = workspace_command::utf8_args(args) else {
        return Ok(Outcome::Declined("run arguments are not UTF-8".into()));
    };
    if parse_options(&argv[1..]).is_none() {
        return Ok(Outcome::Declined("outside native run grammar".into()));
    }
    let cwd = env::current_dir()?;
    let Some(root) = workspace::root(&cwd) else {
        return run_missing_app(args, 0);
    };
    if is_empty_app_workspace(&root).unwrap_or(false)
        && let Some(count) = standard_nonapp_component_count(&root)
    {
        return run_missing_app(args, count);
    }
    Ok(Outcome::Declined("run execution delegated".into()))
}

pub(super) fn parse_options(args: &[&str]) -> Option<Options> {
    let mut options = Options::default();
    let mut idx = 0;
    while idx < args.len() {
        let arg = args[idx];
        match arg {
            "--no-color" => return None,
            "-d" | "--dev" => options.dev = true,
            "-v" | "--verbose" => options.verbose = true,
            "-w" | "--watch" => options.watch = true,
            "-n" | "--no-browser" => options.no_browser = true,
            "-p" | "--port" => {
                if let Some(&next) = args.get(idx + 1)
                    && !next.starts_with('-')
                {
                    options.port = Some(next.to_owned());
                    idx += 1;
                } else {
                    options.port = Some(String::new());
                }
            }
            "-a" | "--args" => {
                let next = *args.get(idx + 1)?;
                options.args = Some(next.to_owned());
                idx += 1;
            }
            _ => apply_inline_or_app(arg, &mut options)?,
        }
        idx += 1;
    }
    Some(options)
}

fn apply_inline_or_app(arg: &str, options: &mut Options) -> Option<()> {
    if let Some(val) = arg.strip_prefix("--port=") {
        options.port = Some(val.to_owned());
    } else if let Some(val) = arg.strip_prefix("--args=") {
        options.args = Some(val.to_owned());
    } else if !arg.starts_with('-') && !arg.is_empty() && options.app_name.is_none() {
        options.app_name = Some(arg.to_owned());
    } else {
        return None;
    }
    Some(())
}
