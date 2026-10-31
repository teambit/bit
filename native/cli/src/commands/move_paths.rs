//! Relocate native workspace sources, relink, then publish the projected bitmap.
use super::{
    Command, add,
    color::Chalk,
    workspace_command::{self, format::Formatter, results::Report},
};
use crate::native::Outcome;
use bit_object_import::component_move::Plan;
use std::{env, ffi::OsString, io};
pub const COMMAND: Command = Command { name: "move", aliases: &["mv"], run };
fn run(args: &[OsString]) -> io::Result<Outcome> {
    let Some(argv) = workspace_command::utf8_args(args) else {
        return Ok(Outcome::Declined("move arguments are not UTF-8".into()));
    };
    let Some((from, to)) = parse_move_args(&argv[1..]) else {
        return Ok(Outcome::Declined("outside native move grammar".into()));
    };
    let cwd = env::current_dir()?;
    let root = match workspace_command::workspace_or_fail(args, "move")? {
        Ok(root) => root,
        Err(outcome) => return Ok(outcome),
    };
    run_workspace(&root, &cwd, args, from, to)
}
fn parse_move_args<'a>(args: &[&'a str]) -> Option<(&'a str, &'a str)> {
    let positionals = super::scope_set::collect_non_flag_tokens(args)?;
    let [from, to] = positionals.as_slice() else {
        return None;
    };
    let from = from.trim();
    let to = to.trim();
    (!from.is_empty() && !to.is_empty()).then_some((from, to))
}
fn run_workspace(
    root: &std::path::Path,
    cwd: &std::path::Path,
    args: &[OsString],
    from: &str,
    to: &str,
) -> io::Result<Outcome> {
    if let Err(error) = Plan::prepare(root, cwd, from, to)
        && (error.kind() != io::ErrorKind::InvalidInput
            || env::var_os("CI").is_some_and(|value| !value.is_empty()))
    {
        return Ok(Outcome::Declined(format!("move: {error}")));
    }
    let chalk = Chalk::detect(args);
    let format = Formatter::new(chalk);
    let mut linker = add::ProjectedLinker::prepare(root)?;
    print!("{}", linker.take_stdout());
    let prepared = Plan::prepare(root, cwd, from, to);
    workspace_command::execute_then(root, args, "move", |output| {
        let plan = prepared?;
        let report = Report { data: report(&plan, &format)?, code: 0, details: None };
        plan.move_sources()?;
        let identities = plan.identities();
        if !identities.is_empty() {
            output.status(&format!("loading {} component(s)", identities.len()));
            linker.link(root, plan.bitmap(), &identities, false, chalk)?;
            print!("{}", linker.take_stdout());
        }
        plan.commit(&workspace_command::file_id())?;
        Ok(report)
    })
}

fn report(plan: &Plan, format: &Formatter) -> io::Result<String> {
    let sections = plan
        .changes()
        .iter()
        .map(|component| format_component_move_section(component, format))
        .collect::<io::Result<Vec<_>>>()?;
    Ok(Formatter::join(&sections))
}

fn format_component_move_section(
    component: &serde_json::Value,
    format: &Formatter,
) -> io::Result<String> {
    let id = component["id"].as_str().ok_or_else(|| io::Error::other("move component identity"))?;
    let mut lines = vec![format.title(&format!("moved component {id}"))];
    for change in component["changes"].as_array().ok_or_else(|| io::Error::other("move paths"))? {
        let from = change["from"].as_str().ok_or_else(|| io::Error::other("move source path"))?;
        let to = change["to"].as_str().ok_or_else(|| io::Error::other("move destination path"))?;
        lines.push(format.item(&format!(
            "from {} to {}",
            format.chalk.bold(from),
            format.chalk.bold(to),
        )));
    }
    Ok(lines.join("\n"))
}
