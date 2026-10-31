//! Continue the same provider session through a real merge-resolution snapshot.
use super::Options;
use crate::commands::{
    status::{
        autosync::Startup,
        js::{array, text},
    },
    workspace_command::{self, Planned, progress::Progress, resolve},
};
use bit_install::output::Output;
use serde_json::{Value, json};
use std::{
    io::{self, Write},
    path::Path,
};

pub(super) fn run(
    root: &Path,
    output: &Output,
    materialized: &mut Planned,
    result: &mut Value,
    options: &Options,
) -> io::Result<()> {
    if let Err(error) = continue_snapshot(root, output, materialized, result, options) {
        result["mergeSnapError"] = json!({"kind":"message","message":error.to_string().trim()});
        if let Some(map) = result.as_object_mut() {
            map.remove("mergeSnapResults");
        }
    }
    Ok(())
}

fn continue_snapshot(
    root: &Path,
    output: &Output,
    materialized: &mut Planned,
    result: &mut Value,
    options: &Options,
) -> io::Result<()> {
    let mut startup = Startup::default();
    let environment = materialized.take_environment();
    let resolved = crate::commands::merge::resolve::plan_continuation(
        root,
        None,
        options.message.as_deref(),
        &mut startup,
        &options.workflow,
        environment,
    );
    io::stdout().write_all(startup.stdout.as_bytes())?;
    let mut resolved = match resolved {
        Ok(resolved) => resolved,
        Err(error) => {
            resolve::render_build_output(output, &startup, true)?;
            return Err(error);
        }
    };
    resolve::render_events(output, &startup)?;
    if let Some(progress) = Progress::parse_snap(resolved.plan.get("progress"))? {
        if startup.snapshot_events.is_empty() {
            progress.render_merge(output);
        } else {
            progress.render_graph(output);
        }
    }
    resolve::render_build_output(output, &startup, false)?;
    workspace_command::commit(&mut resolved, root)?;
    result["mergeSnapResults"] = snap_results(&resolved)?;
    Ok(())
}

fn snap_results(resolved: &Planned) -> io::Result<Value> {
    let versions = array(resolved.plan.get("allocatedVersions"), "merge allocated versions")?;
    let snapped =
        array(resolved.plan["result"].get("resolvedComponents"), "merge resolved components")?
            .iter()
            .map(|row| {
                let raw = text(row.get("id"))?.trim();
                let identity = raw.split_once('@').map_or(raw, |(bare, _)| bare.trim());
                let version = versions
                    .iter()
                    .find(|version| version["identity"].as_str().map(str::trim) == Some(identity))
                    .ok_or_else(|| io::Error::other("merge allocated identity absent"))?;
                Ok(json!({"id":format!("{identity}@{}",text(version.get("hash"))?.trim())}))
            })
            .collect::<io::Result<Vec<_>>>()?;
    Ok(
        json!({"snappedComponents":snapped,"autoSnappedResults":resolved.plan["autoSnappedResults"]}),
    )
}
