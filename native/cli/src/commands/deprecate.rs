//! Local native deprecation policy, published through the ordinary snapshot pipeline later.
mod options;
mod report;
use super::{
    Command, add,
    color::Chalk,
    workspace_command::{self, format::Formatter, results::Report},
};
use crate::{native::Outcome, workspace};
use bit_object_import::component_deprecation::Plan;
use std::{env, ffi::OsString, io};
pub const COMMAND: Command = Command { name: "deprecate", aliases: &["d"], run };
pub const UNDEPRECATE: Command = Command { name: "undeprecate", aliases: &[], run };
fn run(args: &[OsString]) -> io::Result<Outcome> {
    let Some(argv) = workspace_command::utf8_args(args) else {
        return Ok(Outcome::Declined("deprecation arguments are not UTF-8".into()));
    };
    let undo = argv[0].trim() == "undeprecate";
    let Some(options) = options::parse(&argv[1..], undo) else {
        return Ok(Outcome::Declined("outside native deprecation grammar".into()));
    };
    let cwd = env::current_dir()?;
    let Some(root) = workspace::root(&cwd) else {
        if is_ci_active() {
            return Ok(Outcome::Declined("not inside a workspace".into()));
        }
        return workspace_command::execute_failure_scope(
            &cwd,
            args,
            command_name(undo),
            false,
            "",
            io::Error::other("Cannot read properties of undefined (reading 'idsByPattern')"),
        );
    };
    run_workspace(&root, args, &options, undo)
}
fn run_workspace(
    root: &std::path::Path,
    args: &[OsString],
    options: &options::Options<'_>,
    undo: bool,
) -> io::Result<Outcome> {
    if let Err(error) =
        Plan::prepare(root, options.pattern, options.replacement, options.range, undo)
        && (error.kind() != io::ErrorKind::InvalidInput || is_ci_active())
    {
        return Ok(Outcome::Declined(format!("deprecation: {error}")));
    }
    let mut linker = add::ProjectedLinker::prepare(root)?;
    print!("{}", linker.take_stdout());
    let prepared = Plan::prepare(root, options.pattern, options.replacement, options.range, undo);
    let formatter = Formatter::new(Chalk::detect(args));
    workspace_command::execute_then(root, args, command_name(undo), |_output| {
        let plan = prepared?;
        let report = Report {
            data: report::render(&plan, options, undo, &formatter),
            code: 0,
            details: None,
        };
        let bitmap = plan.original_bitmap()?;
        for id in plan.hydration_ids() {
            linker.capture(root, &bitmap, std::slice::from_ref(id))?;
            print!("{}", linker.take_stdout());
        }
        linker.validate_captures()?;
        plan.commit(&workspace_command::file_id())?;
        Ok(report)
    })
}

const fn command_name(undo: bool) -> &'static str {
    if undo { "undeprecate" } else { "deprecate" }
}

fn is_ci_active() -> bool {
    env::var_os("CI")
        .is_some_and(|value| {
            let text = value.to_string_lossy();
            let trimmed = text.trim();
            !trimmed.is_empty() && trimmed != "0" && !trimmed.eq_ignore_ascii_case("false")
        })
}
