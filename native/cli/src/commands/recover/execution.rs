//! Import all missing recoveries before publishing per-component remove configuration.
//!
//! [`execute`] runs [`Batch`] recovery plans with [`recover_import`], [`recover_scope_import`], and [`ProjectedLinker`].
use super::{Chalk, Formatter, OsString, Report, io, options::Options, workspace_command};
use crate::commands::{
    add::ProjectedLinker,
    import::{RecoverOptions, recover_import, recover_probe, recover_scope_import},
};
use bit_install::output::Output;
use bit_object_import::component_recover::Batch;
use std::path::Path;

/// Executes the component recovery [`Batch`] plan for `options.pattern`, importing missing objects and relinking via [`ProjectedLinker`].
pub(super) fn execute(
    root: &Path,
    args: &[OsString],
    options: &Options<'_>,
    linker: &mut ProjectedLinker,
    output: &Output,
) -> io::Result<Report> {
    let pattern = options.pattern.trim();
    if pattern.is_empty() {
        return Err(io::Error::other("recover pattern is empty"));
    }
    if pattern.contains(['*', '?']) {
        // ComponentList.getFromFileSystem enters Consumer.loadMany even when
        // every selected row is removed; its invalidation precedes that split.
        let cache = bit_install::dependencies::cache::invalidation::deps_dir(root);
        bit_install::dependencies::cache::invalidation::invalidate(root, &cache)?;
    }
    let mut plan = Batch::prepare(root, pattern)?;
    let missing = plan.scope_import_ids()?;
    if !missing.is_empty() {
        plan.validate()?;
        recover_scope_import(root, &missing, output)?;
        plan = Batch::prepare(root, pattern)?;
    }
    let load = plan.hydration_ids();
    if !load.is_empty() {
        let rows = linker.capture(root, plan.bitmap(), &load)?;
        plan.refresh_loaded(&rows)?;
    }
    let probes = plan.probe_ids();
    if !probes.is_empty() {
        plan.resolve_remote(&recover_probe(root, &probes)?)?;
    }
    let stdout = linker.take_stdout();
    if !stdout.is_empty() {
        print!("{stdout}");
    }
    import(root, args, options, linker, output, &mut plan)?;
    plan.commit(&workspace_command::file_id())?;
    report(options, &plan, args)
}
/// Imports any missing recovery component versions in `plan` via [`recover_import`] and refreshes `.bitmap`.
#[inline]
fn import(
    root: &Path,
    args: &[OsString],
    options: &Options<'_>,
    linker: &mut ProjectedLinker,
    output: &Output,
    plan: &mut Batch,
) -> io::Result<()> {
    let ids = plan.import_ids();
    if ids.is_empty() {
        return Ok(());
    }
    plan.validate()?;
    let controls = RecoverOptions { skip_write_config_files: options.skip_config };
    let action =
        |installer| recover_import(root, &ids, &controls, Chalk::detect(args), output, installer);
    let bitmap = if options.skip_installation {
        action(None)?
    } else {
        linker.with_installer(|installer| action(Some(installer)))?
    };
    plan.after_import(&bitmap)
}
/// Formats the recovery [`Report`] listing all component IDs restored by `plan`.
#[inline]
fn report(options: &Options<'_>, plan: &Batch, args: &[OsString]) -> io::Result<Report> {
    let format = Formatter::new(Chalk::detect(args));
    let items = plan
        .recovered_ids()
        .into_iter()
        .filter_map(|id| {
            let trimmed = id.trim();
            (!trimmed.is_empty()).then(|| format.item(trimmed))
        })
        .collect::<Vec<_>>();
    if items.is_empty() {
        return Err(io::Error::other(format!(
            r#"no soft-deleted components found matching pattern "{}""#,
            options.pattern.trim(),
        )));
    }
    Ok(Report {
        data: format!(
            "{}\n{}",
            format.success_summary("successfully recovered the following component(s)"),
            items.join("\n"),
        ),
        code: 0,
        details: None,
    })
}
