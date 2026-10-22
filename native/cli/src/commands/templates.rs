//! Native `bit templates` (`TemplatesCmd`).
//!
//! Validates CLI arguments natively before delegating template discovery to
//! the Node.js generator aspect runtime.

#[cfg(test)]
mod tests;

use super::{Command, workspace_command};
use crate::native::Outcome;
use std::{ffi::OsString, io};

pub const COMMAND: Command = Command { name: "templates", aliases: &[], run };

#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) struct Options {
    pub show_all: bool,
    pub aspect: Option<String>,
    pub json: bool,
}

fn run(args: &[OsString]) -> io::Result<Outcome> {
    let Some(argv) = workspace_command::utf8_args(args) else {
        return Ok(Outcome::Declined("templates arguments are not UTF-8".into()));
    };
    let Some(_options) = parse_options(&argv[1..]) else {
        return Ok(Outcome::Declined("outside native templates grammar".into()));
    };
    Ok(Outcome::Declined("templates requires generator aspect runtime".into()))
}

pub(super) fn parse_options(args: &[&str]) -> Option<Options> {
    let mut options = Options { show_all: false, aspect: None, json: false };
    let mut iter = args.iter().copied();
    while let Some(token) = iter.next() {
        apply_templates_token(token, &mut iter, &mut options)?;
    }
    Some(options)
}

fn apply_templates_token<'a>(
    token: &'a str,
    iter: &mut impl Iterator<Item = &'a str>,
    options: &mut Options,
) -> Option<()> {
    match token {
        "--no-color" => {}
        "--show-all" | "-s" => options.show_all = true,
        "--no-show-all" => options.show_all = false,
        "--json" | "-j" => options.json = true,
        "--no-json" => options.json = false,
        "--aspect" | "-a" => {
            let val = iter.next()?;
            options.aspect =
                Some((!val.is_empty() && !val.starts_with('-')).then(|| val.to_owned())?);
        }
        _ if let Some(val) = token.strip_prefix("--aspect=") => {
            options.aspect = Some((!val.is_empty()).then(|| val.to_owned())?);
        }
        _ => return None,
    }
    Some(())
}
