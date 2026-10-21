//! Native `bit insights -l|--list [-j|--json]` (`scopes/explorer/insights/insights.cmd.ts`).

#[cfg(test)]
mod tests;

use super::{
    Command,
    lane::scope_root,
    workspace_command::{self, results::Report},
};
use crate::{history::History, native::Outcome};
use serde_json::json;
use std::{
    ffi::OsString,
    io::{self, Write},
    process::ExitCode,
};

pub const COMMAND: Command = Command { name: "insights", aliases: &[], run };

const CORE_INSIGHTS: [&str; 2] = ["circular", "duplicate dependencies"];

#[derive(Debug, Default, PartialEq, Eq)]
pub(super) struct Options {
    pub list: bool,
    pub json: bool,
}

fn run(args: &[OsString]) -> io::Result<Outcome> {
    let Some(argv) = workspace_command::utf8_args(args) else {
        return Ok(Outcome::Declined("insights arguments are not UTF-8".into()));
    };
    let Some(opts) = parse_options(&argv[1..]) else {
        return Ok(Outcome::Declined("outside native insights grammar".into()));
    };
    let rendered = serde_json::to_string_pretty(&json!(CORE_INSIGHTS))?;
    let root_opt = scope_root::discover().ok().flatten();
    if opts.json {
        let history = root_opt
            .as_ref()
            .filter(|root| !root.bare)
            .map(|root| History::start(&root.path, args));
        let mut stdout = io::stdout().lock();
        stdout.write_all(rendered.as_bytes())?;
        stdout.flush()?;
        if let Some(history) = history {
            history.end(true);
        }
        return Ok(Outcome::Exit(ExitCode::SUCCESS));
    }
    let report = Report { data: rendered, code: 0, details: None };
    match root_opt {
        Some(root) if !root.bare => {
            workspace_command::execute_then(&root.path, args, "insights", |_| Ok(report))
        }
        Some(root) => workspace_command::execute_with_scope(&root.path, args, "insights", &report),
        None => {
            let mut stdout = io::stdout().lock();
            writeln!(stdout, "{}", report.data)?;
            stdout.flush()?;
            Ok(Outcome::Exit(ExitCode::SUCCESS))
        }
    }
}

pub(super) fn parse_options(args: &[&str]) -> Option<Options> {
    let mut opts = Options::default();
    for &arg in args {
        match arg {
            "-l" | "--list" => opts.list = true,
            "-j" | "--json" => opts.json = true,
            "--no-color" => {}
            _ => return None,
        }
    }
    opts.list.then_some(opts)
}
