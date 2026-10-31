//! `MergeConflictOnRemote` terminal formatting for structured HTTP action failures.
use crate::commands::color::Chalk;
use serde_json::Value;
use std::{env, io};

pub(super) fn format(error: io::Error) -> io::Error {
    let Some(value) = bit_client_transfer::http::action_conflict(&error) else { return error };
    let chalk = Chalk::detect(&env::args_os().skip(1).collect::<Vec<_>>());
    let conflicts = value["idsAndVersionsWithConflicts"]
        .as_array()
        .map_or(&[][..], Vec::as_slice);
    let updates = value["idsNeedUpdate"]
        .as_array()
        .map_or(&[][..], Vec::as_slice);
    let mut output = Vec::new();
    deleted_report(conflicts, updates, chalk, &mut output);
    conflict_report(conflicts, chalk, &mut output);
    update_report(updates, chalk, &mut output);
    io::Error::other(output.concat())
}

fn deleted_report(conflicts: &[Value], updates: &[Value], chalk: Chalk, output: &mut Vec<String>) {
    let deleted: Vec<_> = conflicts
        .iter()
        .chain(updates)
        .filter(|value| deleted_flag(value))
        .map(|value| id(value, chalk))
        .collect();
    if !deleted.is_empty() {
        output.push(format!("error: the following component(s) were marked as deleted on the remote scope: {}.\n\
            the current components seem to be re-created and have a different history.\n\
            to resolve this error, you'll need to recover the deleted components, re-do your changes, then tag/snap and export.\n\
            here is a step-by-step guide:\n\
            1) backup your current component to another directory.\n\
            2) run \"bit recover <component-id>\". it'll restore the deleted component.\n\
            3) re-do your changes on the restored component.\n\
            4) run \"bit tag\" or \"bit snap\" to create a new version of the component.\n\
            5) run \"bit export\" to export the new version to the remote scope.\n", deleted.join(", ")));
    }
}

fn conflict_report(conflicts: &[Value], chalk: Chalk, output: &mut Vec<String>) {
    let conflicts: Vec<_> = conflicts
        .iter()
        .filter(|value| !deleted_flag(value))
        .map(|value| {
            let versions = value["versions"]
                .as_array()
                .map_or(&[][..], Vec::as_slice)
                .iter()
                .map(|value| value.as_str().unwrap_or("undefined"))
                .collect::<Vec<_>>()
                .join(", ");
            format!("{} (version(s): {versions})", id(value, chalk))
        })
        .collect();
    if !conflicts.is_empty() {
        output.push(format!("error: versions conflict occurred when exporting the component(s) {} to the remote scope.\n\
            to resolve this conflict and merge your remote and local changes, please do the following:\n\
            1) bit reset [component-pattern] [--all]\n\
            2) bit checkout head [component-pattern]\n\
            once your changes are merged with the new remote version, please tag and export a new version of the component to the remote scope.", conflicts.join(", ")));
    }
}

fn update_report(updates: &[Value], chalk: Chalk, output: &mut Vec<String>) {
    let updates: Vec<_> = updates
        .iter()
        .filter(|value| !deleted_flag(value))
        .map(|value| {
            let lane = value["lane"]
                .as_str()
                .or_else(|| value["lane"]["name"].as_str())
                .filter(|lane| !lane.is_empty())
                .map_or_else(String::new, |lane| format!(" (lane: {lane})"));
            format!("{}{lane}", id(value, chalk))
        })
        .collect();
    if !updates.is_empty() {
        output.push(format!(
            "merge error occurred when exporting the component(s) {} to the remote scope.\n\
            to resolve this error, please re-import the above components.\n\
            if the component is up to date, run \"bit status\" to make sure it's not merge-pending",
            updates.join(", "),
        ));
    }
}

fn deleted_flag(value: &Value) -> bool {
    value["isDeleted"].as_bool() == Some(true)
}
fn id(value: &Value, chalk: Chalk) -> String {
    if let Some(raw) = value["id"]
        .as_str()
        .filter(|raw| !raw.is_empty())
    {
        return chalk.bold(raw);
    }
    if let Some(name) = value["id"]["name"]
        .as_str()
        .filter(|name| !name.is_empty())
    {
        let formatted = match value["id"]["scope"]
            .as_str()
            .filter(|scope| !scope.is_empty())
        {
            Some(scope) => format!("{scope}/{name}"),
            None => name.to_owned(),
        };
        return chalk.bold(&formatted);
    }
    chalk.bold("undefined")
}
