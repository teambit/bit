//! Pre-effect declines stop before providers; later failures belong to the retained import.
use super::{Planned, cache, lifecycle::Lifecycle, options::Options, output, patterns};
use crate::{
    commands::{color::Chalk, workspace_command::results::Report},
    native::Outcome,
};
use std::{ffi::OsString, io, path::Path, time::Instant};

pub(super) fn run(root: &Path, args: &[OsString], options: &Options) -> io::Result<Outcome> {
    let preflight = match super::preparation::local_preflight(root, options) {
        Ok(preflight) => preflight,
        Err(error) => return Ok(Outcome::Declined(format!("import: {error}"))),
    };
    let preflight_ok = matches!(preflight, super::preparation::Preflight::Ready);
    let required = match Lifecycle::required(root, options, preflight_ok) {
        Ok(required) => required,
        Err(error) => return Ok(Outcome::Declined(format!("import: {error}"))),
    };
    let mut lifecycle = Lifecycle::bootstrap(root, args, options, required, preflight_ok)?;
    print!("{}", lifecycle.take_stdout());
    if let Some(error) = options.validation_error() {
        return output::execute(root, args, options, |_| Err(io::Error::other(error)));
    }
    let chalk = Chalk::detect(args);
    if let Some(outcome) = preflight_outcome(root, args, options, preflight, chalk)? {
        return Ok(outcome);
    }
    let selected = patterns::select(root, options);
    let selection = match selected {
        Ok(selection) => selection,
        Err(error) => return failure(root, args, options, lifecycle.started(), error),
    };
    if selection.ids.is_empty() && !options.ids.is_empty() {
        return output::empty(root, args, options, &selection, chalk);
    }
    execute_selected(root, args, options, lifecycle, chalk, &selection)
}
fn preflight_outcome(
    root: &Path,
    args: &[OsString],
    options: &Options,
    preflight: super::preparation::Preflight,
    chalk: Chalk,
) -> io::Result<Option<Outcome>> {
    match preflight {
        super::preparation::Preflight::Ready => Ok(None),
        super::preparation::Preflight::Empty => {
            let empty = patterns::Selection { ids: Vec::new(), warnings: Vec::new() };
            output::empty(root, args, options, &empty, chalk).map(Some)
        }
        super::preparation::Preflight::Fail(error) => {
            output::execute(root, args, options, |_| Err(io::Error::other(error))).map(Some)
        }
    }
}
fn execute_selected(
    root: &Path,
    args: &[OsString],
    options: &Options,
    mut lifecycle: Lifecycle,
    chalk: Chalk,
    selection: &patterns::Selection,
) -> io::Result<Outcome> {
    let cache = match cache::prepare(root, options, &selection.ids, lifecycle.started()) {
        Ok(cache) => cache,
        Err(error) => return failure(root, args, options, lifecycle.started(), error),
    };
    if let Some(cache) = cache {
        lifecycle.own_cache();
        if let Err(error) = cache.commit(root) {
            return failure(root, args, options, true, error);
        }
    }
    if options.selection.dependents.active() {
        return output::execute(root, args, options, |output| {
            let started = Instant::now();
            output::selection(options, selection, output);
            let mut planned =
                Planned::plan_graph(root, options, &selection.ids, chalk, &mut lifecycle, output)?;
            complete(root, options, output, started, &mut lifecycle, &mut planned)
        });
    }
    let planned = Planned::plan(root, options, &selection.ids, chalk);
    let mut planned = match planned {
        Ok(planned) => planned,
        Err(error) => return failure(root, args, options, lifecycle.started(), error),
    };
    output::execute(root, args, options, |output| {
        let started = Instant::now();
        output::selection(options, selection, output);
        complete(root, options, output, started, &mut lifecycle, &mut planned)
    })
}
fn complete(
    root: &Path,
    options: &Options,
    output: &bit_install::output::Output,
    started: Instant,
    lifecycle: &mut Lifecycle,
    planned: &mut Planned,
) -> io::Result<Report> {
    let advanced = options.selection.dependents.active()
        || options.write.adoption.track_only
        || options.write.adoption.write_to_empty_dir
        || options.write.adoption.write_deps.is_some()
        || planned.prepared["directoryWarnings"]
            .as_array()
            .is_some_and(|warnings| !warnings.is_empty());
    if advanced {
        super::render_progress(planned, options, output);
    }
    for warning in planned.prepared["directoryWarnings"]
        .as_array()
        .into_iter()
        .flatten()
    {
        output.warning(
            warning
                .as_str()
                .map(str::trim)
                .filter(|msg| !msg.is_empty())
                .ok_or_else(|| io::Error::other("native import directory warning"))?,
        );
    }
    lifecycle.before_apply()?;
    let applied = planned.apply()?;
    lifecycle.acknowledge(root, &applied)?;
    if applied["requiresWriteDependencies"] == true {
        planned.write_dependencies(root, options, lifecycle)?;
    }
    lifecycle.render(root, planned, options, output, started, advanced)?;
    if !options.objects_only {
        remove_imported_packages_from_root_policy(root, &planned.receipt.ids)?;
    }
    Ok(Report { data: planned.report.clone(), code: 0, details: None })
}

fn remove_imported_packages_from_root_policy(root: &Path, ids: &[String]) -> io::Result<()> {
    let packages = ids
        .iter()
        .filter_map(|id| imported_package_name(id))
        .collect::<Vec<_>>();
    if packages.is_empty() || !root_policy_has_any(root, &packages) {
        return Ok(());
    }
    bit_install::command::edit_workspace_config(
        root,
        &crate::workspace::scope_path(root),
        &crate::commands::workspace_command::file_id(),
        "import (remove package)",
        move |document| {
            bit_install::command::remove_root_policy_entries(document, &packages);
        },
    )
}

fn imported_package_name(id: &str) -> Option<String> {
    let id = id.trim();
    let without_ver = id.rsplit_once('@').map_or(id, |(base, _)| base.trim());
    let (scope, name) = without_ver.split_once('/')?;
    let scope = scope.trim();
    let name = name.trim().trim_matches('/');
    if scope.is_empty() || name.is_empty() {
        return None;
    }
    let name_dots = name.replace('/', ".");
    if let Some((owner, scope_name)) = scope.split_once('.') {
        let owner = owner.trim();
        let scope_name = scope_name.trim();
        if owner.is_empty() || scope_name.is_empty() {
            return None;
        }
        Some(format!("@{owner}/{scope_name}.{name_dots}"))
    } else {
        Some(format!("@{scope}/{name_dots}"))
    }
}

fn root_policy_has_any(root: &Path, packages: &[String]) -> bool {
    let Ok(bytes) = std::fs::read(root.join("workspace.jsonc")) else { return false };
    let Ok(ws) = bit_object_import::parse_jsonc(&bytes) else { return false };
    let Some((_, resolver)) =
        crate::commands::update_cmd::aspect_entry(&ws, "teambit.dependencies/dependency-resolver")
    else {
        return false;
    };
    let policy = &resolver["policy"];
    packages
        .iter()
        .any(|pkg| {
            policy["dependencies"].get(pkg).is_some()
                || policy["peerDependencies"].get(pkg).is_some()
        })
}
fn failure(
    root: &Path,
    args: &[OsString],
    options: &Options,
    owned: bool,
    error: io::Error,
) -> io::Result<Outcome> {
    if owned && !error.to_string().starts_with("the engine declined") {
        return output::execute(root, args, options, |_| Err(error));
    }
    Ok(Outcome::Declined(format!("{}: {error}", options.operation)))
}
