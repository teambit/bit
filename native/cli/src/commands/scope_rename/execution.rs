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
struct Entries {
    facts: Vec<Value>,
    batch: Batch,
}
pub(super) fn run(
    root: &Path,
    options: &Options,
    linker: &mut ProjectedLinker,
    chalk: Chalk,
    output: &bit_install::output::Output,
) -> io::Result<Report> {
    let selection = Selection::prepare(root, options)?;
    selection.publish_default(&workspace_command::file_id())?;
    if let Some(scope) = &selection.default_scope {
        linker.call(root, "identityScopeDefault", &json!({"scope":scope}))?;
        print!("{}", linker.take_stdout());
    }
    let mut entries = prepare(root, &selection, linker)?;
    phases::initial(root, &mut entries, linker, chalk, output, options)?;
    entries.batch.write(&workspace_command::file_id(), "rename")?;
    entries.batch.publish_configuration(&workspace_command::file_id())?;
    linker.forget_loaded();
    let mut changed = phases::targets(root, &mut entries, linker)?;
    if options.refactor {
        changed = phases::refactor(root, &mut entries, linker, output, &changed)?;
    }
    phases::materialize(root, &mut entries, linker)?;
    entries.batch.finish(&workspace_command::file_id())?;
    let ids = phases::ids(&entries.batch)?;
    if !ids.is_empty() {
        linker.link_retained(root, entries.batch.bitmap(), &ids, false, chalk)?;
        print!("{}", linker.take_stdout());
        if !options.owner && !options.skip_install {
            install(root, linker)?;
        }
        linker.call(
            root,
            "renameTooling",
            &json!({"action":"compile","ids":ids,"progress":!options.owner}),
        )?;
        print!("{}", linker.take_stdout());
    }
    output.stop();
    Ok(Report {
        data: report::render(&entries.batch, options, &changed, &Formatter::new(chalk))?,
        code: 0,
        details: None,
    })
}
fn prepare(
    root: &Path,
    selection: &Selection,
    linker: &mut ProjectedLinker,
) -> io::Result<Entries> {
    let mut prepared = rename::preparation::prepare_many(root, &selection.entries)?;
    let workspace = bit_object_import::parse_jsonc(&std::fs::read(root.join("workspace.jsonc"))?)?;
    let tracking_scope = workspace["teambit.workspace/workspace"]["defaultScope"].clone();
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

fn install(root: &Path, linker: &mut ProjectedLinker) -> io::Result<()> {
    if let Err(error) = linker.install_scope_rename(root) {
        linker.call(
            root,
            "renameTooling",
            &json!({"action":"installFailure","message":error.to_string()}),
        )?;
    }
    print!("{}", linker.take_stdout());
    Ok(())
}
