//! Native `bit generate-preview` and `bit serve-preview` (`scopes/preview/preview/preview.cmd.tsx`).

#[cfg(test)]
mod tests;

use super::{
    Command,
    color::Chalk,
    scope_set::{Failure, selection},
    script::active_component_count,
    workspace_command::{self, results::Report},
};
use crate::{native::Outcome, workspace};
use bit_install::{config::WorkspaceConfig, workspace::Bitmap};
use bit_object_import::parse_jsonc;
use std::{env, ffi::OsString, fs, io, path::Path};

pub const GENERATE_PREVIEW: Command =
    Command { name: "generate-preview", aliases: &[], run: run_generate };
pub const SERVE_PREVIEW: Command = Command { name: "serve-preview", aliases: &[], run: run_serve };

#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub(super) struct GenerateOptions {
    pub pattern: Option<String>,
    pub name: Option<String>,
}

#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub(super) struct ServeOptions {
    pub port: Option<u16>,
}

fn run_generate(args: &[OsString]) -> io::Result<Outcome> {
    let Some(argv) = workspace_command::utf8_args(args) else {
        return Ok(Outcome::Declined("generate-preview arguments are not UTF-8".into()));
    };
    let Some(options) = parse_generate_options(&argv[1..]) else {
        return Ok(Outcome::Declined("outside native generate-preview grammar".into()));
    };
    if env::var_os("CI").is_some_and(|val| !val.is_empty()) {
        return Ok(Outcome::Declined("CI generate-preview delegated".into()));
    }
    let cwd = env::current_dir()?;
    let Some(root) = workspace::root(&cwd) else {
        let pat = options.pattern.as_deref().unwrap_or("undefined");
        let msg = format!("unable to find components by the pattern: {pat}");
        return workspace_command::execute_failure_scope(
            &cwd,
            args,
            "generate-preview",
            false,
            "",
            io::Error::other(msg),
        );
    };
    if let Some(outcome) = try_run_workspace_generate(&root, args, &options)? {
        return Ok(outcome);
    }
    Ok(Outcome::Declined("generate-preview execution delegated".into()))
}

fn try_run_workspace_generate(
    root: &Path,
    args: &[OsString],
    options: &GenerateOptions,
) -> io::Result<Option<Outcome>> {
    let Ok(ws_config) = WorkspaceConfig::load(root) else {
        return Ok(None);
    };
    if ws_config.workspace.bitmap_auto_sync == Some(true) {
        return Ok(None);
    }
    let Ok(bitmap_bytes) = fs::read(root.join(".bitmap")) else {
        return Ok(None);
    };
    let Ok(bitmap_val) = parse_jsonc(&bitmap_bytes) else {
        return Ok(None);
    };
    let count = active_component_count(&bitmap_val);
    if let Some(pat) = options.pattern.as_deref() {
        let Ok(bitmap) = Bitmap::load(root, ws_config.workspace.default_scope.as_deref()) else {
            return Ok(None);
        };
        if let Err(Failure::User(msg)) =
            selection::resolve_pattern_entries(root, &bitmap, pat, Chalk::detect(args))
        {
            let outcome =
                workspace_command::execute_then(root, args, "generate-preview", move |_| {
                    Err(io::Error::other(msg))
                })?;
            return Ok(Some(outcome));
        }
        return Ok(None);
    }
    if count == 0 {
        let chalk = Chalk::detect(args);
        let data = chalk.green("previews generated successfully in:\n");
        let outcome = workspace_command::execute_then(root, args, "generate-preview", |_| {
            Ok(Report { data, code: 0, details: None })
        })?;
        return Ok(Some(outcome));
    }
    Ok(None)
}

fn run_serve(args: &[OsString]) -> io::Result<Outcome> {
    let Some(argv) = workspace_command::utf8_args(args) else {
        return Ok(Outcome::Declined("serve-preview arguments are not UTF-8".into()));
    };
    if parse_serve_options(&argv[1..]).is_none() {
        return Ok(Outcome::Declined("outside native serve-preview grammar".into()));
    }
    Ok(Outcome::Declined("serve-preview execution delegated".into()))
}

pub(super) fn parse_generate_options(args: &[&str]) -> Option<GenerateOptions> {
    let mut options = GenerateOptions::default();
    let mut iter = args.iter().copied();
    while let Some(arg) = iter.next() {
        match arg {
            "--" => {
                consume_trailing_preview_pattern(iter, &mut options.pattern)?;
                break;
            }
            "--no-color" | "--no-color=true" | "--no-color=false" => {}
            "-n" | "--name" => {
                let val = iter.next()?.trim();
                (!val.is_empty() && !val.starts_with('-')).then_some(())?;
                options.name = Some(val.to_owned());
            }
            val if let Some(name) = val
                .strip_prefix("--name=")
                .or_else(|| val.strip_prefix("-n=")) =>
            {
                let name = name.trim();
                (!name.is_empty() && !name.starts_with('-')).then_some(())?;
                options.name = Some(name.to_owned());
            }
            val if !val.starts_with('-')
                && !val.trim().is_empty()
                && options.pattern.is_none() =>
            {
                options.pattern = Some(val.trim().to_owned());
            }
            _ => return None,
        }
    }
    Some(options)
}

fn consume_trailing_preview_pattern<'a>(
    iter: impl Iterator<Item = &'a str>,
    pattern: &mut Option<String>,
) -> Option<()> {
    for rest in iter {
        let trimmed = rest.trim();
        if trimmed.is_empty() || trimmed.starts_with('-') || pattern.is_some() {
            return None;
        }
        *pattern = Some(trimmed.to_owned());
    }
    Some(())
}

pub(super) fn parse_serve_options(args: &[&str]) -> Option<ServeOptions> {
    let mut options = ServeOptions::default();
    let mut idx = 0;
    while idx < args.len() {
        let arg = args[idx];
        match arg {
            "--" => return (idx + 1 == args.len()).then_some(options),
            "--no-color" | "--no-color=true" | "--no-color=false" => {}
            "-p" | "--port" => {
                if let Some(&next) = args.get(idx + 1)
                    && !next.starts_with('-')
                {
                    options.port = parse_optional_port(next)?;
                    idx += 1;
                } else {
                    options.port = None;
                }
            }
            val if let Some(port) = val
                .strip_prefix("--port=")
                .or_else(|| val.strip_prefix("-p=")) =>
            {
                options.port = parse_optional_port(port)?;
            }
            _ => return None,
        }
        idx += 1;
    }
    Some(options)
}

fn parse_optional_port(port: &str) -> Option<Option<u16>> {
    let port = port.trim();
    if port.is_empty() { Some(None) } else { port.parse::<u16>().ok().map(Some) }
}
