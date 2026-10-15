//! Native main-lane `bit reset <component>` for a linear local history.

use super::{
    color::Chalk,
    list::bitmap,
    workspace_command::{self, format::Formatter, results::Report},
};
use crate::{commands::Command, native::Outcome, workspace};
use bit_object_import::reset_main::Plan;
use std::{env, ffi::OsString, io};

pub const COMMAND: Command = Command { name: "reset", aliases: &[], run };

struct Options<'a> {
    pattern: &'a str,
    head: bool,
    force: bool,
}

fn parse<'a>(args: &[&'a str]) -> Option<Options<'a>> {
    let mut pattern = None;
    let mut head = false;
    let mut force = false;
    for arg in args {
        match *arg {
            "--head" if !head => head = true,
            "--force" | "-f" if !force => force = true,
            "--silent" | "-s" => (),
            arg if !arg.starts_with('-')
                && pattern.is_none()
                && !arg.contains(['*', '?', '{', '}']) =>
            {
                pattern = Some(arg);
            }
            _ => return None,
        }
    }
    Some(Options { pattern: pattern?, head, force })
}

fn run(args: &[OsString]) -> io::Result<Outcome> {
    let Some(argv) = workspace_command::utf8_args(args) else {
        return Ok(Outcome::Declined("reset arguments are not UTF-8".into()));
    };
    let Some(options) = parse(&argv[1..]) else {
        return Ok(Outcome::Declined("outside the native reset grammar".into()));
    };
    let Some(root) = workspace::root(&env::current_dir()?) else {
        return Ok(Outcome::Declined("not inside a workspace".into()));
    };
    let bitmap = match bitmap::read(&root) {
        Ok(bitmap) => bitmap,
        Err(error) => return Ok(Outcome::Declined(format!("reset bitmap: {error}"))),
    };
    if bitmap.lane.is_some() {
        return Ok(Outcome::Declined("reset on a lane".into()));
    }
    let matched: Vec<_> = bitmap.entries
        .iter()
        .filter(|entry| {
            entry.identity == options.pattern
                || entry.identity
                    .rsplit_once('/')
                    .is_some_and(|(_, name)| name == options.pattern)
        })
        .collect();
    if matched.len() != 1 {
        return Ok(Outcome::Declined("reset identity absent or ambiguous".into()));
    }
    let identity = &matched[0].identity;
    let plan = match Plan::prepare(&root, identity, options.head, options.force) {
        Ok(plan) => plan,
        Err(error) => return Ok(Outcome::Declined(format!("reset: {error}"))),
    };
    let formatter = Formatter::new(Chalk::detect(args));
    let item = formatter.item(&format!(
        "{} - version(s): {}",
        formatter.chalk.cyan(identity),
        plan.selection.labels.join(", ")
    ));
    let report = Report {
        data: Formatter::join(&[
            formatter.section("reset components", "", &[item]),
            formatter.success_summary("1 component(s) reset successfully"),
        ]),
        code: 0,
        details: None,
    };
    workspace_command::execute_with(&root, args, "reset", &report, |_| {
        plan.commit(&workspace_command::file_id())
    })
}
