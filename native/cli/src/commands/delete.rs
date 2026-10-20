//! RemoveMain.markRemoveComps: packages, one bitmap publication, then source removal.
pub(in crate::commands) mod hard;
pub(super) mod loading;
mod options;
mod policy;
mod preparation;
use super::{
    add,
    color::Chalk,
    remove::preparation as selection,
    workspace_command::{self, format::Formatter, results::Report},
};
use crate::{commands::Command, native::Outcome, workspace};
use preparation::Prepared;
use std::{env, ffi::OsString, io, path::Path};
pub const COMMAND: Command = Command { name: "delete", aliases: &[], run };
fn run(args: &[OsString]) -> io::Result<Outcome> {
    let Some(argv) = workspace_command::utf8_args(args) else {
        return Ok(Outcome::Declined("arguments are not UTF-8".into()));
    };
    if argv[1..].contains(&"--hard") {
        return hard::run(args, &argv[1..]);
    }
    let Some(options) = options::parse(&argv[1..]) else {
        return Ok(Outcome::Declined("outside the native delete grammar".into()));
    };
    let Some(root) = workspace::root(&env::current_dir()?) else {
        return Ok(Outcome::Declined("not inside a workspace".into()));
    };
    if let Err(error) = preflight(&root, &options)
        && (error.kind() != io::ErrorKind::InvalidInput
            || env::var_os("CI").is_some_and(|value| !value.is_empty()))
    {
        return Ok(Outcome::Declined(format!("delete: {error}")));
    }
    let mut linker = add::ProjectedLinker::prepare(&root)?;
    print!("{}", linker.take_stdout());
    workspace_command::execute_then(&root, args, "delete", |output| {
        execute(&root, args, &options, &mut linker, output)
    })
}
fn execute(
    root: &Path,
    args: &[OsString],
    options: &options::Options<'_>,
    linker: &mut add::ProjectedLinker,
    output: &bit_install::output::Output,
) -> io::Result<Report> {
    preparation::validate_options(root, options)?;
    let bitmap = selection::bitmap(root)?;
    let ids = linker.select_workspace(root, &bitmap, options.pattern, output)?;
    Prepared::selected(root, options, &ids)?;
    let graph = !bitmap["_bit_lane"].is_null()
        && !options.update_main
        && matches!(options.scope, bit_object_import::component_delete::Scope::Entire);
    let loaded_ids = if graph { selection::all(&bitmap) } else { ids.clone() };
    let loadable = selection::loadable(root, &bitmap, &loaded_ids)?;
    output.status(&format!("loading {} component(s)", ids.len()));
    loading::validate(root, &bitmap, &ids, Chalk::detect(args))?;
    let rows = if loadable.is_empty() {
        Vec::new()
    } else {
        linker.capture_cached(root, &bitmap, &loadable)?
    };
    print!("{}", linker.take_stdout());
    let prepared = Prepared::with_rows(root, options, &ids, &rows)?;
    if prepared.plan
        .plans()
        .iter()
        .any(bit_object_import::component_delete::Plan::policy_loaded)
    {
        output.status(&format!("loading {} component(s)", ids.len()));
    }
    prepared.validate(root)?;
    let file_id = workspace_command::file_id();
    linker.validate_captures()?;
    prepared.plan.commit(&file_id)?;
    let format = Formatter::new(Chalk::detect(args));
    if let Some(policy) = &prepared.policy
        && policy.commit(root, &file_id).is_ok()
    {
        output.console(&policy.report(&format));
    }
    Ok(report(&prepared, &format))
}
fn report(prepared: &Prepared, format: &Formatter) -> Report {
    let items = prepared.plan
        .plans()
        .iter()
        .filter(|plan| plan.entire())
        .map(|plan| format.item(plan.full_id()))
        .collect::<Vec<_>>()
        .join("\n");
    Report { data: Formatter::join(&[format.success_summary("successfully deleted the following components"), items, format.hint(r#"to update the remote, please tag/snap and then export. to revert, please use "bit recover""#)]), code: 0, details: None }
}

fn preflight(root: &Path, options: &options::Options<'_>) -> io::Result<()> {
    if add::ProjectedLinker::state_pattern(options.pattern) {
        preparation::validate_options(root, options)?;
        add::ProjectedLinker::preflight_selection(root, &selection::bitmap(root)?)
    } else {
        Prepared::prepare(root, options, true).map(|_| ())
    }
}
