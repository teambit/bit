use super::{
    Action, Prepared, Record, Selected, invalid,
    merge::{self, snapshot::local_model as model},
    planning, scratch, selection,
};
use crate::workspace::{engine::command::materialization, snapshots};
use serde_json::json;
use std::io;

pub(super) fn prepare(
    record: &Record,
    planned: &mut planning::Planned,
    prepared: &mut Prepared,
    selected: &[Selected],
    snapshots: &snapshots::State,
) -> io::Result<()> {
    let mut models = Vec::new();
    for (index, selected) in selected.iter().enumerate() {
        if selected.action == Action::Target {
            add_material(record, planned, selected, index, snapshots)?;
            models.push(model(&selected.model, &selected.remote)?);
        }
    }
    if !models.is_empty() {
        let directory = scratch::Directory::create()?;
        prepared.fast_forward = Some(merge::snapshot::prepare_models(&directory.0, models)?);
        planned.directories.push(directory);
    }
    Ok(())
}

fn add_material(
    record: &Record,
    planned: &mut planning::Planned,
    selected: &Selected,
    index: usize,
    snapshots: &snapshots::State,
) -> io::Result<()> {
    let directory = scratch::Directory::create()?;
    let label = selection::versions::label(&selected.model, &selected.remote);
    let selection = json!({"version":label});
    let material = materialization::prepare(
        &materialization::Input {
            root: &record.request.root,
            directory: &directory.0,
            current: &planned.captured[index],
            version: &selected.versions[2],
            reference: &selected.remote,
            selection: &selection,
            base: None,
            options: &record.request.options,
        },
        &record.repository,
        &mut planned.transitions,
        snapshots,
    )?;
    planned.result["components"]
        .as_array_mut()
        .ok_or_else(|| invalid("command fast-forward results"))?
        .push(material.output.clone());
    planned.materials.push(material);
    planned.directories.push(directory);
    Ok(())
}

#[cfg(test)]
mod tests;
