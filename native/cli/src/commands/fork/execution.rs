mod copy;
mod remote;
mod transform;
use super::{inventory, options::Options, policy, report, selection};
use crate::commands::{add::ProjectedLinker, color::Chalk, workspace_command::results::Report};
use bit_object_import::component_fork::RemoteCapture;
use serde_json::{Value, json};
use std::{io, path::Path};
struct Results {
    ids: Vec<String>,
    facts: Vec<Value>,
    old_packages: Vec<String>,
    captures: Vec<RemoteCapture>,
}
pub(super) fn run(
    root: &Path,
    options: &Options,
    linker: &mut ProjectedLinker,
    chalk: Chalk,
    output: &bit_install::output::Output,
) -> io::Result<Report> {
    let state = inventory::read(root)?;
    let selected = selection::select(root, options, &state)?;
    let mut results =
        Results { ids: vec![], facts: vec![], old_packages: vec![], captures: vec![] };
    for id in &selected.local {
        local(root, options, (&selected.target_scope, id), linker, chalk, output, &mut results)?;
    }
    if !selected.remote.is_empty() {
        if !options.multiple() && options.flags.refactor {
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                format!(
                    "the component {} is not in the workspace, you can't use the --refactor flag.\nthe reason is that the refactor changes the components using {}, since it's not in the workspace, no components were using it, so nothing to refactor",
                    options.source, options.source,
                ),
            ));
        }
        remote::run(
            root,
            options,
            &selected.remote,
            &selected.target_scope,
            linker,
            chalk,
            &mut results,
        )?;
        if options.multiple() {
            transform::multiple(root, options, linker, output, &results)?;
        }
        policy::persist(root, linker, &results.facts, &results.old_packages, options.multiple())?;
        if !options.flags.skip_install {
            linker.install_fork(root)?;
            print!("{}", linker.take_stdout());
        }
    }
    for capture in &results.captures {
        capture.validate()?;
    }
    output.stop();
    Ok(report::render(options, &results.ids, chalk))
}
fn local(
    root: &Path,
    options: &Options,
    source: (&str, &str),
    linker: &mut ProjectedLinker,
    chalk: Chalk,
    output: &bit_install::output::Output,
    results: &mut Results,
) -> io::Result<()> {
    let (scope, id) = (source.0.trim(), source.1.trim());
    if scope.is_empty() || id.is_empty() {
        return Err(io::Error::other("fork source identity is empty"));
    }
    let bitmap = bitmap(root)?;
    let captured = linker.capture(root, &bitmap, &[id.to_owned()])?;
    print!("{}", linker.take_stdout());
    let mut source = captured
        .into_iter()
        .find(|row| {
            row["identity"]
                .as_str()
                .or_else(|| row["id"].as_str())
                .is_some_and(|candidate| candidate.trim() == id)
        })
        .ok_or_else(|| io::Error::other("fork captured source missing"))?;
    let state = inventory::read(root)?;
    let inventory = inventory::selected(&state, id)
        .ok_or_else(|| io::Error::other("fork source inventory changed"))?;
    source["rootDir"] = inventory["rootDir"].clone();
    source["mainFile"] = source["current"]["mainFile"].clone();
    let facts = source_facts(root, linker, &mut source, false)?;
    let target = copy::run(root, options, scope, &source, false, linker, chalk)?;
    if options.flags.refactor {
        transform::local(root, options, linker, output, &facts, &target)?;
    }
    results.ids.push(target);
    Ok(())
}
fn source_facts(
    root: &Path,
    linker: &mut ProjectedLinker,
    source: &mut Value,
    remote: bool,
) -> io::Result<Value> {
    let facts = linker.call(root, "forkSourceFacts", &json!({"component":source,"remote":remote}))?;
    print!("{}", linker.take_stdout());
    source["sourceConfigs"] = facts["configs"].clone();
    source["sourceId"] = facts["sourceId"].clone();
    source["version"] = facts["sourceId"]["version"].clone();
    Ok(facts)
}
fn bitmap(root: &Path) -> io::Result<Value> {
    bit_object_import::parse_jsonc(&std::fs::read(root.join(".bitmap"))?)
}
