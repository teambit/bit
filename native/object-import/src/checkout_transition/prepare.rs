mod current;
mod merge;
mod sources;

use super::{invalid, plan, wire};
use serde_json::{Value, json};
use std::{fs, io};

pub(super) fn prepare(input: &Value, state: &mut plan::State) -> io::Result<Value> {
    let request: wire::Prepare = serde_json::from_value(input.clone()).map_err(io::Error::other)?;
    if !request.snapshot_directory.is_absolute()
        || !fs::symlink_metadata(&request.snapshot_directory)?.is_dir()
        || fs::read_dir(&request.snapshot_directory)?.next().is_some()
    {
        return Err(invalid("checkout private directory must be ordinary empty"));
    }
    if request.target.files.len() > 4096
        || request.current.len() > 4096
        || !request.objects_directory.is_absolute()
    {
        return Err(invalid("checkout prepare path/count limit"));
    }
    let mut total = 0;
    let mut compressed = 0;
    let target =
        sources::load(&request.objects_directory, &request.target, &mut total, &mut compressed)?;
    let current = current::load(&request.current, &mut total)?;
    let statuses = statuses(&request, &target, &current);
    let (mut bodies, target_indices, current_files) = retain_inputs(&request, target, &current);
    let rows = merge::rows(&request, &current, &mut bodies, &mut total, &mut compressed)?;
    let plan = plan::Plan {
        bodies,
        target: request.target.files,
        target_indices,
        current: current_files,
        has_conflicts: rows
            .iter()
            .any(|row| row.get("conflictPlanIndex").is_some() || row["isBinaryConflict"] == true),
        statuses,
        merge_rows: rows,
    };
    state.retain(plan, input, &request.snapshot_directory)
}
fn retain_inputs(
    request: &wire::Prepare,
    target: Vec<Vec<u8>>,
    current: &[current::Loaded],
) -> (Vec<plan::Body>, Vec<usize>, Vec<plan::Current>) {
    let mut bodies = target
        .into_iter()
        .map(plan::Body::new)
        .collect::<Vec<_>>();
    let target_indices = (0..bodies.len()).collect::<Vec<_>>();
    let mut current_files = Vec::new();
    for (index, file) in current.iter().enumerate() {
        let plan_index = bodies.len();
        bodies.push(plan::Body::new(file.normalized.clone()));
        current_files.push(plan::Current {
            relative_path: request.current[index].relative_path.clone(),
            path: request.current[index].path.clone(),
            protected: request.current[index].protected,
            plan_index,
            shares_buffer: file.raw == file.normalized,
        });
    }
    (bodies, target_indices, current_files)
}
fn statuses(
    request: &wire::Prepare,
    target: &[Vec<u8>],
    current: &[current::Loaded],
) -> Vec<Value> {
    request.target.files
        .iter()
        .enumerate()
        .map(|(index, file)| {
            let equal = request.current
                .iter()
                .position(|other| other.relative_path == file.relative_path)
                .is_some_and(|position| current[position].raw == target[index]);
            json!({"relativePath":file.relative_path,"status":if equal{"unchanged"}else{"updated"}})
        })
        .collect()
}
