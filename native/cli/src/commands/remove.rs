//! `RemoveMain`'s local batch removal with retained provider startup and native scope publication.
pub(super) mod preparation;

mod load_free;
mod options;
mod report;
use super::{
    add,
    color::Chalk,
    workspace_command::{self, format::Formatter, results::Report},
};
use crate::{commands::Command, native::Outcome};
use std::{ffi::OsString, io, path::Path};
pub const COMMAND: Command = Command { name: "remove", aliases: &["rm"], run };
fn run(args: &[OsString]) -> io::Result<Outcome> {
    let Some(argv) = workspace_command::utf8_args(args) else {
        return Ok(Outcome::Declined("arguments are not UTF-8".into()));
    };
    let Some(options) = options::parse(&argv[1..]) else {
        return Ok(Outcome::Declined("outside the native remove grammar".into()));
    };
    let root = match workspace_command::workspace_or_fail(args, "remove")? {
        Ok(root) => root,
        Err(outcome) => return Ok(outcome),
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
    let mut reader = load_free::Reader::new(root).ok();
    let consumers =
        status_consumers(root, &bitmap, &selected, options.force, linker, reader.as_mut())?;
    let (removed, modified) = preparation::classify(&selected, &consumers);
    let rows = load(root, &bitmap, &removed, options, linker, output, reader.as_ref())?;
    let plan = preparation::prepare(root, &removed, options, &rows)?;
    if !options.force {
        plan.check_aspect_usage(&preparation::facts(&rows))?;
    }
    linker.validate_captures()?;
    if let Some(reader) = &mut reader {
        reader.validate()?;
    }
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
    reader: Option<&load_free::Reader>,
) -> io::Result<Vec<serde_json::Value>> {
    if removed.is_empty() {
        return Ok(Vec::new());
    }
    let has_new = !options.force && removed.iter().any(|id| preparation::is_new(bitmap, id));
    let ids = if has_new { preparation::all(bitmap) } else { removed.to_vec() };
    let (mut rows, pending) = metadata(ids, reader);
    if !pending.is_empty() {
        output.status(&format!("loading {} component(s)", pending.len()));
        let loadable = preparation::loadable(root, bitmap, &pending)?;
        if !loadable.is_empty() {
            rows.extend(linker.capture_cached(root, bitmap, &loadable)?);
        }
        print!("{}", linker.take_stdout());
    }
    Ok(rows)
}

fn metadata(
    ids: Vec<String>,
    reader: Option<&load_free::Reader>,
) -> (Vec<serde_json::Value>, Vec<String>) {
    let mut rows = Vec::new();
    let mut pending = Vec::new();
    for id in ids {
        if let Some(row) = reader.and_then(|reader| reader.metadata(&id)) {
            rows.push(row);
        } else {
            pending.push(id);
        }
    }
    (rows, pending)
}

fn preflight(root: &Path, options: &options::Options<'_>) -> io::Result<()> {
    if options.pattern.trim().is_empty() {
        return Err(io::Error::other("remove pattern is empty"));
    }
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
    mut reader: Option<&mut load_free::Reader>,
) -> io::Result<Vec<serde_json::Value>> {
    if force {
        return Ok(Vec::new());
    }
    let mut rows = Vec::new();
    let mut pending = Vec::new();
    for id in selected {
        if let Some(modified) = reader
            .as_deref_mut()
            .and_then(|reader| reader.status(root, bitmap, id))
        {
            rows.push(serde_json::json!({"identity":id,"modified":modified}));
        } else {
            pending.push(id.clone());
        }
    }
    let loadable = preparation::loadable(root, bitmap, &pending)?;
    if loadable.len() != pending.len() {
        use bit_install::dependencies::cache::invalidation::{deps_dir, invalidate};
        invalidate(root, &deps_dir(root))?;
    }
    linker.call(root, "identityConsumerMode", &serde_json::json!({"enabled":true}))?;
    if !loadable.is_empty() {
        rows.extend(linker.capture_consumers(root, bitmap, &loadable)?);
    }
    print!("{}", linker.take_stdout());
    linker.call(root, "identityConsumerMode", &serde_json::json!({"enabled":false}))?;
    Ok(rows)
}
