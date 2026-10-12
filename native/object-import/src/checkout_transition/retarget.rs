use super::{invalid, plan, prepare, wire};
use serde::Deserialize;
use serde_json::{Value, json};
use std::{io, path::PathBuf};
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Request {
    token: String,
    objects_directory: PathBuf,
    snapshot_directory: PathBuf,
    target: wire::Version,
}
pub(super) fn apply(input: Value, state: &mut plan::State) -> io::Result<Value> {
    let request: Request = serde_json::from_value(input).map_err(io::Error::other)?;
    if !request.objects_directory.is_absolute() || request.target.files.len() > 4096 {
        return Err(invalid("merge retarget bounds"));
    }
    let retained = state.plans
        .values()
        .map(plan::Plan::bytes)
        .sum::<usize>();
    let body_count = state.plans
        .values()
        .map(|plan| plan.bodies.len())
        .sum::<usize>();
    let contents = load(&request, retained)?;
    let plan =
        state.plans.get_mut(&request.token).ok_or_else(|| invalid("stale merge template plan"))?;
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
    Ok(plan.manifest(&request.token))
}

fn additions(
    plan: &plan::Plan,
    contents: Vec<Vec<u8>>,
    directory: &std::path::Path,
    token: &str,
) -> (Vec<usize>, Vec<plan::Body>) {
    let mut indices = Vec::new();
    let mut added = Vec::new();
    for body in contents {
        let mut body = plan::Body::new(body);
        if let Some(index) = plan.bodies
            .iter()
            .position(|existing| existing.hash == body.hash)
        {
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
fn load(request: &Request, retained: usize) -> io::Result<Vec<Vec<u8>>> {
    let mut total = retained;
    let mut compressed = 0;
    prepare::sources::load(&request.objects_directory, &request.target, &mut total, &mut compressed)
}
fn check_budget(body_count: usize, retained: usize, added: &[plan::Body]) -> io::Result<()> {
    if body_count + added.len() > 4096
        || retained
            + added
                .iter()
                .map(|body| body.contents.len())
                .sum::<usize>()
            > 32 * 1024 * 1024
    {
        return Err(invalid("merge template owner budget"));
    }
    Ok(())
}
fn statuses(plan: &plan::Plan, target: &[wire::Manifest]) -> Vec<Value> {
    target
        .iter()
        .map(|file| {
            let same = plan.current
                .iter()
                .find(|current| current.relative_path == file.relative_path)
                .is_some_and(|current| current.raw_hash == file.hash);
            json!({"relativePath":file.relative_path,"status":if same {"unchanged"}else{"updated"}})
        })
        .collect()
}
