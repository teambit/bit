#[cfg(test)]
mod tests;

use super::{invalid, plan, prepare, wire};
use serde::Deserialize;
use serde_json::{Value, json};
use std::{collections::HashMap, io, path::PathBuf};
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Request {
    token: String,
    objects_directory: PathBuf,
    snapshot_directory: PathBuf,
    target: wire::Version,
    known_bodies: Option<usize>,
}
pub(super) fn apply_with_overlay(
    input: Value,
    state: &mut plan::State,
    overlay: Option<&crate::command_import::Overlay>,
) -> io::Result<Value> {
    let request: Request = serde_json::from_value(input).map_err(io::Error::other)?;
    if !request.objects_directory.is_absolute() || request.target.files.len() > 4096 {
        return Err(invalid("merge retarget bounds"));
    }
    let retained = state.plans
        .values()
        .map(plan::Plan::bytes)
        .fold(0_usize, usize::saturating_add);
    let body_count = state.plans
        .values()
        .map(|plan| plan.bodies.len())
        .fold(0_usize, usize::saturating_add);
    let token = request.token.trim();
    let previous = state.plans.get(token).ok_or_else(|| invalid("stale merge template plan"))?;
    let contents = load(&request, retained, previous, overlay)?;
    let plan = state.plans.get_mut(token).ok_or_else(|| invalid("stale merge template plan"))?;
    let directory = request.snapshot_directory;
    if !directory.is_absolute()
        || !std::fs::symlink_metadata(&directory)?.is_dir()
        || plan.bodies
            .first()
            .is_some_and(|body| body.path.parent() != Some(directory.as_path()))
    {
        return Err(invalid("merge template spool directory"));
    }
    let (indices, mut added) = additions(plan, contents, &directory, &request.token);
    check_budget(body_count, retained, &added)?;
    if plan.bodies.first().is_some_and(|body| body.offset.is_some()) {
        super::spool::assign(&mut added, &directory, &request.token, plan.bodies.len());
    }
    super::spool::write(&added)?;
    plan.bodies.extend(added);
    if plan.other.is_none() {
        plan.other = Some(plan.target.clone());
    }
    plan.statuses = statuses(plan, &request.target.files);
    plan.target = request.target.files;
    plan.target_indices = indices;
    Ok(manifest(plan, &request.token, request.known_bodies))
}

fn manifest(plan: &plan::Plan, token: &str, known: Option<usize>) -> Value {
    known.map_or_else(|| plan.manifest(token), |known| {
        json!({"knownBodies":known,"bodyCount":plan.bodies.len(),"bodies":plan.bodies.iter().enumerate().skip(known).map(|(index, body)|body.manifest(index)).collect::<Vec<_>>()})
    })
}

fn retained_indices(plan: &plan::Plan) -> HashMap<&str, usize> {
    let mut indices = HashMap::new();
    for (index, body) in plan.bodies.iter().enumerate() {
        indices.entry(body.hash.as_str()).or_insert(index);
    }
    indices
}
fn additions(
    plan: &plan::Plan,
    contents: Vec<Vec<u8>>,
    directory: &std::path::Path,
    token: &str,
) -> (Vec<usize>, Vec<plan::Body>) {
    let retained = retained_indices(plan);
    let mut indices = Vec::new();
    let mut added = Vec::new();
    for body in contents {
        let mut body = plan::Body::new(body);
        if let Some(&index) = retained.get(body.hash.as_str()) {
            indices.push(index);
        } else {
            let index = plan.bodies.len() + added.len();
            body.path = directory.join(format!("{token}-{index}.checkout"));
            indices.push(index);
            added.push(body);
        }
    }
    (indices, added)
}
fn load(
    request: &Request,
    retained: usize,
    previous: &plan::Plan,
    overlay: Option<&crate::command_import::Overlay>,
) -> io::Result<Vec<Vec<u8>>> {
    if request.known_bodies.is_some_and(|count| count != previous.bodies.len()) {
        return Err(invalid("merge retained body prefix mismatch"));
    }
    let cached = previous.bodies
        .iter()
        .map(|body| (body.hash.as_str(), body.contents.as_slice()))
        .collect::<HashMap<_, _>>();
    let mut total = retained;
    let mut compressed = 0;
    if request.target.files
        .iter()
        .all(|file| cached.contains_key(file.hash.trim()))
    {
        // Public target cloning has already observed its Sources. Reuse verified
        // operation-owned bytes while still checking the complete Version manifest.
        prepare::sources::verify(
            &request.objects_directory,
            &request.target,
            &mut compressed,
            overlay,
        )?;
        return request.target.files
            .iter()
            .map(|file| {
                let body = cached[file.hash.trim()];
                total = total
                    .checked_add(body.len())
                    .filter(|total| *total <= 32 * 1024 * 1024)
                    .ok_or_else(|| invalid("checkout prepared raw limit"))?;
                Ok(body.to_vec())
            })
            .collect();
    }
    prepare::sources::load_with_overlay(
        &request.objects_directory,
        &request.target,
        &mut total,
        &mut compressed,
        overlay,
    )
}
fn check_budget(body_count: usize, retained: usize, added: &[plan::Body]) -> io::Result<()> {
    let added_bytes = added
        .iter()
        .map(|body| body.contents.len())
        .sum::<usize>();
    if body_count.saturating_add(added.len()) > 4096
        || retained
            .checked_add(added_bytes)
            .is_none_or(|total| total > 32 * 1024 * 1024)
    {
        return Err(invalid("merge template owner budget"));
    }
    Ok(())
}
fn statuses(plan: &plan::Plan, target: &[wire::Manifest]) -> Vec<Value> {
    let mut current = HashMap::new();
    for file in &plan.current {
        current.entry(file.relative_path.as_str()).or_insert(file);
    }
    target
        .iter()
        .map(|file| {
            let same = current
                .get(file.relative_path.as_str())
                .is_some_and(|current| current.raw_hash.trim() == file.hash.trim());
            json!({"relativePath":file.relative_path,"status":if same {"unchanged"}else{"updated"}})
        })
        .collect()
}
