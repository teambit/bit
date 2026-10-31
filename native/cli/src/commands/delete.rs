//! RemoveMain.markRemoveComps: packages, one bitmap publication, then source removal.
pub(in crate::commands) mod hard;
pub(super) mod loading;
pub(in crate::commands) mod options;
mod policy;
mod preparation;
use super::{
    add,
    color::Chalk,
    remove::preparation as selection,
    workspace_command::{self, format::Formatter, results::Report},
};
use crate::{commands::Command, native::Outcome};
use preparation::Prepared;
use std::{env, ffi::OsString, io, path::Path};
pub const COMMAND: Command = Command { name: "delete", aliases: &[], run };
pub(super) const NON_INTERACTIVE_PROMPT_ERR: &str = "this command requires a confirmation, but this session is non-interactive (no TTY, CI, or an AI agent) so the confirmation prompt cannot be shown.\nre-run with --silent to skip the confirmation, or run the command in an interactive terminal";

fn is_hard_delete(args: &[&str]) -> bool {
    let mut hard = false;
    for &arg in args {
        match arg.trim() {
            "--" => break,
            "--hard" | "--hard=true" => hard = true,
            "--hard=false" => hard = false,
            _ => {}
        }
    }
    hard
}

fn run(args: &[OsString]) -> io::Result<Outcome> {
    let Some(argv) = workspace_command::utf8_args(args) else {
        return Ok(Outcome::Declined("arguments are not UTF-8".into()));
    };
    if is_hard_delete(&argv[1..]) {
        return hard::run(args, &argv[1..]);
    }
    let Some(options) = options::parse(&argv[1..]) else {
        return Ok(Outcome::Declined("outside the native delete grammar".into()));
    };
    let root = match resolve_delete_root(args, &options)? {
        Ok(root) => root,
        Err(outcome) => return Ok(outcome),
    };
    if let Err(error) = preflight(&root, &options)
        && (error.kind() != io::ErrorKind::InvalidInput || ci_enabled())
    {
        return Ok(Outcome::Declined(format!("delete: {error}")));
    }
    let mut linker = add::ProjectedLinker::prepare(&root)?;
    print!("{}", linker.take_stdout());
    workspace_command::execute_then(&root, args, "delete", |output| {
        execute(&root, args, &options, &mut linker, output)
    })
}

fn resolve_delete_root(
    args: &[OsString],
    options: &options::Options<'_>,
) -> io::Result<Result<std::path::PathBuf, Outcome>> {
    let cwd = env::current_dir()?;
    if let Some(root) = crate::workspace::root(&cwd) {
        return resolve_workspace_delete(root, args, options);
    }
    if !options.silent {
        if !preparation::can_prompt_user() && !ci_enabled() {
            return workspace_command::execute_failure_scope(
                &cwd,
                args,
                "delete",
                false,
                "",
                io::Error::other(NON_INTERACTIVE_PROMPT_ERR),
            )
            .map(Err);
        }
        return Ok(Err(Outcome::Declined("interactive delete confirmation prompt".into())));
    }
    workspace_command::workspace_or_fail(args, "delete")
}

fn ci_enabled() -> bool {
    env::var_os("CI")
        .is_some_and(|val| {
            let text = val.to_string_lossy();
            let trimmed = text.trim();
            !trimmed.is_empty() && trimmed != "0" && !trimmed.eq_ignore_ascii_case("false")
        })
}

fn resolve_workspace_delete(
    root: std::path::PathBuf,
    args: &[OsString],
    options: &options::Options<'_>,
) -> io::Result<Result<std::path::PathBuf, Outcome>> {
    if !super::installation::Installer::needs_canonical(&root) && !ci_enabled() {
        if let Err(err) =
            preparation::validate_pre_prompt(&root, options.lane, options.update_main, false)
        {
            return workspace_command::execute_then(&root, args, "delete", |_| Err(err)).map(Err);
        }
        if !options.silent && !preparation::can_prompt_user() {
            return workspace_command::execute_then(&root, args, "delete", |_| {
                Err(io::Error::other(NON_INTERACTIVE_PROMPT_ERR))
            })
            .map(Err);
        }
    }
    if !options.silent {
        return Ok(Err(Outcome::Declined("interactive delete confirmation prompt".into())));
    }
    Ok(Ok(root))
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
