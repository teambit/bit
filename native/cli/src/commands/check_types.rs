//! Native `bit check-types [component-pattern]` (`scopes/typescript/typescript/cmds/check-types.cmd.ts`).

mod checker;
#[cfg(test)]
mod tests;

use super::{
    Command,
    color::Chalk,
    script::active_component_count,
    workspace_command::{self, format::Formatter, results::Report},
};
use crate::{native::Outcome, workspace};
use bit_object_import::parse_jsonc;
use std::{env, ffi::OsString, fs, io, path::Path};

pub const COMMAND: Command = Command { name: "check-types", aliases: &[], run };

const OUTSIDE_WORKSPACE_ERR: &str = "This command can only be run inside a bit workspace. Please check that you are inside a bit workspace and then re-run (to initialize a new workspace please use bit init)";
const EMPTY_CHECK_TYPES_HINT: &str = "no components found to check.\nuse \"--unmodified\" flag to check all components or specify the ids to check.\notherwise, only new and modified components will be checked";

#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub(super) struct Options {
    pub pattern: Option<String>,
    pub all: bool,
    pub unmodified: bool,
    pub strict: bool,
    pub json: bool,
}

fn run(args: &[OsString]) -> io::Result<Outcome> {
    let Some(argv) = workspace_command::utf8_args(args) else {
        return Ok(Outcome::Declined("check-types arguments are not UTF-8".into()));
    };
    let Some(options) = parse_options(&argv[1..]) else {
        return Ok(Outcome::Declined("outside native check-types grammar".into()));
    };
    if env::var_os("CI").is_some_and(|val| !val.is_empty()) {
        return Ok(Outcome::Declined("CI check-types delegated".into()));
    }
    let cwd = env::current_dir()?;
    let Some(root) = workspace::root(&cwd) else {
        return emit_outside_workspace(&cwd, args, &options);
    };
    if options.pattern.is_none() && is_empty_workspace(&root).unwrap_or(false) {
        return emit_empty_check_types(&root, args, &options);
    }
    if let Some(outcome) = checker::try_run(&root, args, &options)? {
        return Ok(outcome);
    }
    Ok(Outcome::Declined("check-types execution delegated".into()))
}

fn emit_outside_workspace(cwd: &Path, args: &[OsString], options: &Options) -> io::Result<Outcome> {
    if options.json {
        return workspace_command::execute_failure_scope(
            cwd,
            args,
            "check-types",
            true,
            "",
            io::Error::other(OUTSIDE_WORKSPACE_ERR),
        );
    }
    let all = options.all;
    workspace_command::execute_without_loader_scope(cwd, args, "check-types", move |output| {
        if all {
            output.warning("--all is deprecated, use --unmodified instead");
        }
        Err(io::Error::other(OUTSIDE_WORKSPACE_ERR))
    })
}

fn emit_empty_check_types(
    root: &Path,
    args: &[OsString],
    options: &Options,
) -> io::Result<Outcome> {
    let formatter = Formatter::new(Chalk::detect(args));
    let all = options.all;
    let json = options.json;
    workspace_command::execute_without_loader(root, args, "check-types", move |output| {
        if all {
            output.warning("--all is deprecated, use --unmodified instead");
        }
        let data = if json { "[]".to_owned() } else { formatter.hint(EMPTY_CHECK_TYPES_HINT) };
        Ok(Report { data, code: 0, details: None })
    })
}

pub(super) fn is_empty_workspace(root: &Path) -> io::Result<bool> {
    let ws_config = parse_jsonc(&fs::read(root.join("workspace.jsonc"))?)?;
    if ws_config["teambit.workspace/workspace"]["bitmapAutoSync"] == true {
        return Ok(false);
    }
    let bitmap = parse_jsonc(&fs::read(root.join(".bitmap"))?)?;
    Ok(active_component_count(&bitmap) == 0)
}

pub(super) fn parse_options(args: &[&str]) -> Option<Options> {
    let mut options = Options::default();
    let mut iter = args.iter().copied();
    while let Some(arg) = iter.next() {
        match arg {
            "--" => {
                consume_trailing_check_types_pattern(iter, &mut options.pattern)?;
                break;
            }
            "--no-color" => {}
            "-a" | "--all" | "--all=true" => options.all = true,
            "--all=false" => options.all = false,
            "-u" | "--unmodified" | "--unmodified=true" => options.unmodified = true,
            "--unmodified=false" => options.unmodified = false,
            "--strict" | "--strict=true" => options.strict = true,
            "--strict=false" => options.strict = false,
            "-j" | "--json" | "--json=true" => options.json = true,
            "--json=false" => options.json = false,
            val if !val.starts_with('-') && !val.is_empty() && options.pattern.is_none() => {
                options.pattern = Some(val.to_owned());
            }
            val => apply_short_flags(val, &mut options)?,
        }
    }
    Some(options)
}

fn consume_trailing_check_types_pattern<'a>(
    iter: impl Iterator<Item = &'a str>,
    pattern: &mut Option<String>,
) -> Option<()> {
    for val in iter {
        (!val.is_empty() && !val.starts_with('-') && pattern.replace(val.to_owned()).is_none())
            .then_some(())?;
    }
    Some(())
}

fn apply_short_flags(arg: &str, options: &mut Options) -> Option<()> {
    let flags = arg.strip_prefix('-')?;
    if flags.is_empty() || flags.starts_with('-') {
        return None;
    }
    for ch in flags.chars() {
        match ch {
            'a' => options.all = true,
            'u' => options.unmodified = true,
            'j' => options.json = true,
            _ => return None,
        }
    }
    Some(())
}
