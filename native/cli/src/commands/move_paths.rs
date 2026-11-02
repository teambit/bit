//! Relocate native workspace sources, relink, then publish the projected bitmap.
//!
//! Executes [`Plan`] path moves ([`COMMAND`]), updates links via [`add`], and formats a [`Report`] with [`Formatter`].
use super::{
    Command, add,
    color::Chalk,
    workspace_command::{self, format::Formatter, results::Report},
};
use crate::native::Outcome;
use bit_object_import::component_move::Plan;
use std::{env, ffi::OsString, io};
/// Descriptor for the native `bit move` (`mv`) command.
pub const COMMAND: Command = Command { name: "move", aliases: &["mv"], run };
/// Entry point for `bit move`.
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
/// Extracts the two non-empty positional path arguments `(from, to)` for `bit move`.
#[inline]
fn parse_move_args<'a>(args: &[&'a str]) -> Option<(&'a str, &'a str)> {
    let positionals = super::scope_set::collect_non_flag_tokens(args)?;
    let [from, to] = positionals.as_slice() else {
        return None;
    };
    let from = from.trim();
    let to = to.trim();
    (!from.is_empty() && !to.is_empty()).then_some((from, to))
}
/// Returns whether the `CI` environment variable is set to a truthy value.
#[inline]
fn ci_enabled() -> bool {
    env::var_os("CI")
        .is_some_and(|value| {
            let text = value.to_string_lossy();
            let trimmed = text
                .trim()
                .trim_matches(['"', '\''])
                .trim();
            !trimmed.is_empty()
                && !trimmed.eq_ignore_ascii_case("0")
                && !trimmed.eq_ignore_ascii_case("false")
                && !trimmed.eq_ignore_ascii_case("no")
                && !trimmed.eq_ignore_ascii_case("off")
        })
}

/// Prepares and executes the [`Plan`] path relocation inside `root`, relinking via [`add::ProjectedLinker`].
fn run_workspace(
    root: &std::path::Path,
    cwd: &std::path::Path,
    args: &[OsString],
    from: &str,
    to: &str,
) -> io::Result<Outcome> {
    let prepared = Plan::prepare(root, cwd, from, to);
    if let Err(error) = &prepared
        && (error.kind() != io::ErrorKind::InvalidInput || ci_enabled())
    {
        return Ok(Outcome::Declined(format!("move: {error}")));
    }
    let chalk = Chalk::detect(args);
    let format = Formatter::new(chalk);
    let mut linker = add::ProjectedLinker::prepare(root)?;
    let startup_stdout = linker.take_stdout();
    if !startup_stdout.is_empty() {
        print!("{startup_stdout}");
    }
    workspace_command::execute_then(root, args, "move", |output| {
        let plan = prepared?;
        let report = Report { data: report(&plan, &format)?, code: 0, details: None };
        plan.move_sources()?;
        let identities = plan.identities();
        if !identities.is_empty() {
            output.status(&format!("loading {} component(s)", identities.len()));
            linker.link(root, plan.bitmap(), &identities, false, chalk)?;
            let link_stdout = linker.take_stdout();
            if !link_stdout.is_empty() {
                print!("{link_stdout}");
            }
        }
        plan.commit(&workspace_command::file_id())?;
        Ok(report)
    })
}

/// Formats the human-readable terminal summary of moved component paths in `plan`.
#[inline]
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
    let id = component["id"]
        .as_str()
        .map(str::trim)
        .filter(|id| !id.is_empty())
        .ok_or_else(|| io::Error::other("move component identity"))?;
    let changes = component["changes"].as_array().ok_or_else(|| io::Error::other("move paths"))?;
    let mut lines = Vec::with_capacity(changes.len() + 1);
    lines.push(format.title(&format!("moved component {id}")));
    for change in changes {
        let from = change["from"]
            .as_str()
            .map(str::trim)
            .filter(|path| !path.is_empty())
            .ok_or_else(|| io::Error::other("move source path"))?;
        let to = change["to"]
            .as_str()
            .map(str::trim)
            .filter(|path| !path.is_empty())
            .ok_or_else(|| io::Error::other("move destination path"))?;
        lines.push(format.item(&format!(
            "from {} to {}",
            format.chalk.bold(from),
            format.chalk.bold(to),
        )));
    }
    Ok(lines.join("\n"))
}
