//! `RemoveMain`'s local batch removal with retained provider startup and native scope publication.
pub(super) mod preparation;

mod options;
mod report;
use super::{
    add,
    color::Chalk,
    workspace_command::{self, format::Formatter, results::Report},
};
use crate::{commands::Command, native::Outcome, workspace};
use std::{env, ffi::OsString, io, path::Path};
pub const COMMAND: Command = Command { name: "remove", aliases: &["rm"], run };
fn run(args: &[OsString]) -> io::Result<Outcome> {
    let Some(argv) = workspace_command::utf8_args(args) else {
        return Ok(Outcome::Declined("arguments are not UTF-8".into()));
    };
    let Some(options) = options::parse(&argv[1..]) else {
        return Ok(Outcome::Declined("outside the native remove grammar".into()));
    };
    let Some(root) = workspace::root(&env::current_dir()?) else {
        return Ok(Outcome::Declined("not inside a workspace".into()));
    };
    if let Err(error) = preflight(&root, &options) {
        return Ok(Outcome::Declined(format!("remove: {error}")));
    }
    let mut linker = add::ProjectedLinker::prepare(&root)?;
    print!("{}", linker.take_stdout());
    workspace_command::execute_then(&root, args, "remove", |output| {
        work(&root, args, &options, &mut linker, output)
    })
}
fn work(
    root: &Path,
    args: &[OsString],
    options: &options::Options<'_>,
    linker: &mut add::ProjectedLinker,
    output: &bit_install::output::Output,
) -> io::Result<Report> {
    output.status("removing components");
    let bitmap = preparation::bitmap(root)?;
    let selected = linker.select_workspace(root, &bitmap, options.pattern, output)?;
    output.status("removing components");
    let consumers = status_consumers(root, &bitmap, &selected, options.force, linker)?;
    let (removed, modified) = preparation::classify(&selected, &consumers);
    let rows = load(root, &bitmap, &removed, options, linker, output)?;
    let plan = preparation::prepare(root, &removed, options, &rows)?;
    if !options.force {
        plan.check_aspect_usage(&preparation::facts(&rows))?;
    }
    linker.validate_captures()?;
    plan.commit(&workspace_command::file_id())?;
    let formatter = Formatter::new(Chalk::detect(args));
    Ok(Report {
        data: report::render(&formatter, &plan.identities(), &plan.lane_identities(), &modified),
        code: 0,
        details: None,
    })
}
fn load(
    root: &Path,
    bitmap: &serde_json::Value,
    removed: &[String],
    options: &options::Options<'_>,
    linker: &mut add::ProjectedLinker,
    output: &bit_install::output::Output,
) -> io::Result<Vec<serde_json::Value>> {
    if removed.is_empty() {
        return Ok(Vec::new());
    }
    let has_new = !options.force
        && removed
            .iter()
            .any(|id| preparation::row(bitmap, id).is_ok_and(|row| row["version"] == ""));
    let ids = if has_new { preparation::all(bitmap) } else { removed.to_vec() };
    output.status(&format!("loading {} component(s)", ids.len()));
    let loadable = preparation::loadable(root, bitmap, &ids)?;
    let rows = if loadable.is_empty() {
        Vec::new()
    } else {
        linker.capture_cached(root, bitmap, &loadable)?
    };
    print!("{}", linker.take_stdout());
    if has_new && !preparation::loadable(root, bitmap, removed)?.is_empty() {
        output.status(&format!("loading {} component(s)", removed.len()));
    }
    Ok(rows)
}

fn preflight(root: &Path, options: &options::Options<'_>) -> io::Result<()> {
    if add::ProjectedLinker::state_pattern(options.pattern) {
        return add::ProjectedLinker::preflight_selection(root, &preparation::bitmap(root)?);
    }
    let ids = preparation::ids(root, options.pattern)?;
    preparation::prepare(root, &ids, options, &[]).map(|_| ())
}

fn status_consumers(
    root: &Path,
    bitmap: &serde_json::Value,
    selected: &[String],
    force: bool,
    linker: &mut add::ProjectedLinker,
) -> io::Result<Vec<serde_json::Value>> {
    if force {
        return Ok(Vec::new());
    }
    let loadable = preparation::loadable(root, bitmap, selected)?;
    linker.call(root, "identityConsumerMode", &serde_json::json!({"enabled":true}))?;
    let rows = if loadable.is_empty() {
        Vec::new()
    } else {
        linker.capture_consumers(root, bitmap, &loadable)?
    };
    print!("{}", linker.take_stdout());
    linker.call(root, "identityConsumerMode", &serde_json::json!({"enabled":false}))?;
    Ok(rows)
}
