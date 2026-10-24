//! Native `bit generate-preview` and `bit serve-preview` (`scopes/preview/preview/preview.cmd.tsx`).

#[cfg(test)]
mod tests;

use super::{Command, workspace_command};
use crate::native::Outcome;
use std::{ffi::OsString, io};

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
    if parse_generate_options(&argv[1..]).is_none() {
        return Ok(Outcome::Declined("outside native generate-preview grammar".into()));
    }
    Ok(Outcome::Declined("generate-preview execution delegated".into()))
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
            "--no-color" => {}
            "-n" | "--name" => {
                let val = iter.next()?;
                (!val.is_empty() && !val.starts_with('-')).then_some(())?;
                options.name = Some(val.to_owned());
            }
            val if val.starts_with("--name=") => {
                let name = &val["--name=".len()..];
                (!name.is_empty()).then_some(())?;
                options.name = Some(name.to_owned());
            }
            val if !val.starts_with('-') && !val.is_empty() && options.pattern.is_none() => {
                options.pattern = Some(val.to_owned());
            }
            _ => return None,
        }
    }
    Some(options)
}

pub(super) fn parse_serve_options(args: &[&str]) -> Option<ServeOptions> {
    let mut options = ServeOptions::default();
    let mut idx = 0;
    while idx < args.len() {
        let arg = args[idx];
        match arg {
            "--no-color" => {}
            "-p" | "--port" => {
                if let Some(&next) = args.get(idx + 1)
                    && !next.starts_with('-')
                {
                    options.port = Some(next.parse::<u16>().ok()?);
                    idx += 1;
                }
            }
            val if val.starts_with("--port=") => {
                options.port = Some(val["--port=".len()..].parse::<u16>().ok()?);
            }
            _ => return None,
        }
        idx += 1;
    }
    Some(options)
}
