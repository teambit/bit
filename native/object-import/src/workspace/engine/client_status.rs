pub(crate) mod config;
mod models;

use super::{invalid, inventory};
use serde::Deserialize;
use serde_json::{Value, json};
use std::{io, path::PathBuf};

#[derive(Default)]
pub(crate) struct State {
    plan: Option<Plan>,
}
pub(in crate::workspace::engine) struct Target {
    id: String,
    directory: String,
    version: String,
}
struct Plan {
    root: PathBuf,
    targets: Vec<Target>,
    cursor: usize,
    pending: Option<u64>,
    inventory: inventory::State,
    modified: Vec<String>,
    new: Vec<String>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Prepare {
    root: PathBuf,
    home: PathBuf,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Scan {
    root_policy: Value,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Finish {
    token: u64,
    combined: Value,
    hard: Value,
    own: Value,
    ignored_root: Vec<String>,
}
pub(super) fn prepare(input: Prepare, state: &mut State) -> io::Result<(usize, Value)> {
    state.plan = None;
    super::path(&input.root)?;
    super::path(&input.home)?;
    let effective = super::status_context::configuration::effective(&input.root, &input.home)?;
    let config = config::configuration_value(&input.root, &effective, false)?;
    let targets = config::targets(&input.root, &config)?;
    let patterns = inventory::patterns::own(&input.root)?;
    let mut output = config::options(&config, &patterns);
    let count = targets.len();
    output["count"] = json!(count);
    state.plan = Some(Plan {
        root: input.root,
        targets,
        cursor: 0,
        pending: None,
        inventory: inventory::State::default(),
        modified: Vec::new(),
        new: Vec::new(),
    });
    Ok((count, output))
}
pub(super) fn scan(
    input: &Scan,
    state: &mut State,
    pool: &rayon::ThreadPool,
) -> io::Result<(usize, Value)> {
    let plan = state.plan.as_mut().ok_or_else(|| invalid("status requires prepare"))?;
    if plan.pending.is_some() {
        return Err(invalid("status scan already pending"));
    }
    let target = plan.targets.get(plan.cursor).ok_or_else(|| invalid("status scan exhausted"))?;
    let exclude: Vec<_> = plan.targets
        .iter()
        .filter(|entry| target.directory == "." && entry.directory != ".")
        .map(|entry| plan.root.join(&entry.directory))
        .collect();
    let input = serde_json::from_value(json!({"root":plan.root.join(&target.directory),
        "workspace":plan.root,"excludeDirs":exclude,"rootPolicy":input.root_policy}))
    .map_err(io::Error::other)?;
    let (count, mut output) = inventory::begin(input, &mut plan.inventory, pool)?;
    plan.pending = output["token"].as_u64();
    // This cache is private to the cold command, unlike the public inventory API.
    output
        .as_object_mut()
        .expect("inventory output")
        .remove("cache");
    Ok((count, output))
}
pub(super) fn finish(
    input: &Finish,
    state: &mut State,
    pool: &rayon::ThreadPool,
) -> io::Result<(usize, Value)> {
    let plan = state.plan.as_mut().ok_or_else(|| invalid("status requires prepare"))?;
    if plan.pending != Some(input.token) {
        return Err(invalid("status stale inventory"));
    }
    plan.pending = None;
    let target = &plan.targets[plan.cursor];
    let request = serde_json::from_value(json!({"token":input.token,"combined":input.combined,
        "hard":input.hard,"own":input.own,"ignoredRoot":input.ignored_root}))
    .map_err(io::Error::other)?;
    let (_, manifest) = inventory::finish(request, &mut plan.inventory, pool)?;
    let paths = manifest["files"]
        .as_array()
        .ok_or_else(|| invalid("status manifest"))?
        .iter()
        .map(|file| {
            file["relativePath"]
                .as_str()
                .map(str::to_owned)
                .ok_or_else(|| invalid("status manifest path"))
        })
        .collect::<io::Result<Vec<_>>>()?;
    if pool.install(|| {
        crate::inspection::modified(
            &plan.root.join(&target.directory),
            &paths,
            target.directory == ".",
            || models::files(&plan.root, target),
        )
    })? {
        plan.modified.push(target.id.clone());
    }
    if target.version.is_empty() {
        plan.new.push(target.id.clone());
    }
    plan.cursor += 1;
    Ok((1, json!({"completed":plan.cursor})))
}
pub(super) fn complete(state: &mut State) -> io::Result<(usize, Value)> {
    let plan = state.plan.take().ok_or_else(|| invalid("status requires prepare"))?;
    if plan.pending.is_some() || plan.cursor != plan.targets.len() {
        return Err(invalid("status incomplete inventory"));
    }
    Ok((plan.cursor, json!({"modified":plan.modified,"newComps":plan.new,"compWithIssues":[]})))
}

#[cfg(test)]
mod tests;
