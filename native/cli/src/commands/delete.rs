//! Native mainline soft deletion of a tracked component.

use super::{
    color::Chalk,
    workspace_command::{self, format::Formatter, results::Report},
};
use crate::{commands::Command, native::Outcome, workspace};
use bit_object_import::component_delete::{Plan, Scope};
use std::{env, ffi::OsString, io};

pub const COMMAND: Command = Command { name: "delete", aliases: &[], run };

fn run(args: &[OsString]) -> io::Result<Outcome> {
    let Some(argv) = workspace_command::utf8_args(args) else {
        return Ok(Outcome::Declined("arguments are not UTF-8".into()));
    };
    let Some((name, scope)) = parse(&argv[1..]) else {
        return Ok(Outcome::Declined("outside the native delete grammar".into()));
    };
    let Some(root) = workspace::root(&env::current_dir()?) else {
        return Ok(Outcome::Declined("not inside a workspace".into()));
    };
    let plan = match Plan::prepare(&root, name, scope) {
        Ok(plan) => plan,
        Err(error) => return Ok(Outcome::Declined(format!("delete: {error}"))),
    };
    let format = Formatter::new(Chalk::detect(args));
    let items = if plan.entire() { format.item(plan.full_id()) } else { String::new() };
    let report = Report {
        data: Formatter::join(&[
            format.success_summary("successfully deleted the following components"),
            items,
            format.hint(r#"to update the remote, please tag/snap and then export. to revert, please use "bit recover""#),
        ]),
        code: 0,
        details: None,
    };
    let file_id = workspace_command::file_id();
    workspace_command::execute_with(&root, args, "delete", &report, |output| {
        output.status("loading 1 component(s)");
        plan.commit(&file_id)
    })
}

#[derive(Default)]
struct Parsed<'a> {
    name: Option<&'a str>,
    silent: bool,
    modifier: Option<(&'a str, &'a str)>,
}

impl<'a> Parsed<'a> {
    fn add(&mut self, arg: &'a str, rest: &mut impl Iterator<Item = &'a str>) -> Option<()> {
        match arg {
            "-s" | "--silent" if !self.silent => self.silent = true,
            "--range" | "--snaps" if self.modifier.is_none() => {
                self.modifier = Some((arg, rest.next()?));
            }
            value if !value.starts_with('-') && self.name.is_none() => self.name = Some(value),
            _ => return None,
        }
        Some(())
    }
}

fn parse<'a>(args: &[&'a str]) -> Option<(&'a str, Scope)> {
    let mut parsed = Parsed::default();
    let mut iter = args.iter().copied();
    while let Some(arg) = iter.next() {
        parsed.add(arg, &mut iter)?;
    }
    parsed.silent.then_some((parsed.name?, selection(parsed.modifier)))
}

fn selection(modifier: Option<(&str, &str)>) -> Scope {
    match modifier {
        Some(("--range", value)) => Scope::Range(value.to_owned()),
        Some(("--snaps", value)) => Scope::Snaps(
            value
                .split(',')
                .map(str::trim)
                .map(str::to_owned)
                .collect(),
        ),
        _ => Scope::Entire,
    }
}
