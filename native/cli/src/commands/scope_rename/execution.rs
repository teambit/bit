//! Scope rename execution across [`Batch`] planning, AST refactoring, and [`ProjectedLinker`] updates.
//!
//! [`run`] coordinates [`phases`] and [`report`] to produce a [`Report`] for [`Options`].
mod phases;
use super::report;
use crate::commands::{
    add::ProjectedLinker,
    color::Chalk,
    rename,
    workspace_command::{self, format::Formatter, results::Report},
};
use bit_object_import::component_scope_rename::{Batch, Options, Selection};
use serde_json::{Value, json};
use std::{io, path::Path};
/// Paired component rename facts and [`Batch`] plan for `bit scope rename`.
struct Entries {
    facts: Vec<Value>,
    batch: Batch,
}
/// Executes a scope rename [`Options`] batch and returns the formatted [`Report`].
pub(super) fn run(
    root: &Path,
    options: &Options,
    linker: &mut ProjectedLinker,
    chalk: Chalk,
    output: &bit_install::output::Output,
) -> io::Result<Report> {
    let selection = Selection::prepare(root, options)?;
    let file_id = workspace_command::file_id();
    selection.publish_default(&file_id)?;
    if let Some(scope) = &selection.default_scope {
        linker.call(root, "identityScopeDefault", &json!({"scope":scope}))?;
        flush_stdout(linker);
    }
    let mut entries = prepare(root, &selection, linker)?;
    phases::initial(root, &mut entries, linker, chalk, output, options)?;
    entries.batch.write(&file_id, "rename")?;
    entries.batch.publish_configuration(&file_id)?;
    linker.forget_loaded();
    let mut changed = phases::targets(root, &mut entries, linker)?;
    if options.refactor {
        changed = phases::refactor(root, &mut entries, linker, output, &changed)?;
    }
    phases::materialize(root, &mut entries, linker)?;
    entries.batch.finish(&file_id)?;
    let ids = phases::ids(&entries.batch)?;
    if !ids.is_empty() {
        finish_linked_tooling(root, &entries.batch, &ids, options, linker, chalk)?;
    }
    output.stop();
    Ok(Report {
        data: report::render(&entries.batch, options, &changed, &Formatter::new(chalk))?,
        code: 0,
        details: None,
    })
}
/// Prepares component rename plans and hydrates provider facts for every entry in `selection` ([`Selection`]).
fn prepare(
    root: &Path,
    selection: &Selection,
    linker: &mut ProjectedLinker,
) -> io::Result<Entries> {
    let mut prepared = rename::preparation::prepare_many(root, &selection.entries)?;
    let workspace = bit_object_import::parse_jsonc(&std::fs::read(root.join("workspace.jsonc"))?)?;
    let tracking_scope = crate::commands::aspect::workspace_default_scope(&workspace)
        .map_or(serde_json::Value::Null, serde_json::Value::String);
    for (component, option) in prepared.iter_mut().zip(&selection.entries) {
        component.facts["trackingDefaultScope"] = tracking_scope.clone();
        rename::execution::hydrate(root, component, option, linker)?;
    }
    let (plans, facts) = prepared
        .into_iter()
        .map(|component| (component.plan, component.facts))
        .unzip();
    Ok(Entries { batch: Batch::prepare(root, plans)?, facts })
}

/// Prints any buffered stdout from `linker` to the process stdout.
#[inline]
fn flush_stdout(linker: &mut ProjectedLinker) {
    let stdout = linker.take_stdout();
    if !stdout.is_empty() {
        print!("{stdout}");
    }
}

/// Runs scope-rename dependency installation via [`ProjectedLinker::install_scope_rename`] and reports failures to `renameTooling`.
fn install(root: &Path, linker: &mut ProjectedLinker) -> io::Result<()> {
    if let Err(error) = linker.install_scope_rename(root) {
        let text = error.to_string();
        let trimmed = text.trim();
        let message = if trimmed.is_empty() {
            "scope rename dependency installation failed"
        } else {
            trimmed
        };
        let res = linker.call(
            root,
            "renameTooling",
            &json!({"action":"installFailure","message":message}),
        );
        flush_stdout(linker);
        res?;
    } else {
        flush_stdout(linker);
    }
    Ok(())
}

#[inline]
fn finish_linked_tooling(
    root: &Path,
    batch: &Batch,
    ids: &[String],
    options: &Options,
    linker: &mut ProjectedLinker,
    chalk: Chalk,
) -> io::Result<()> {
    let linked = linker.link_retained(root, batch.bitmap(), ids, false, chalk);
    flush_stdout(linker);
    linked?;
    if !options.owner && !options.skip_install {
        install(root, linker)?;
    }
    let compiled = linker.call(
        root,
        "renameTooling",
        &json!({"action":"compile","ids":ids,"progress":!options.owner}),
    );
    flush_stdout(linker);
    compiled?;
    Ok(())
}
