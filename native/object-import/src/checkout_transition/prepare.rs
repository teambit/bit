//! Checkout plan preparation ([`prepare`]): target [`sources`] loading, [`current`] file hashing, and three-way [`merge`] rows.

pub(super) mod sources;

mod current;
mod merge;

use super::{invalid, plan, wire};
use serde_json::{Value, json};
use std::{collections::HashMap, fs, io};

/// Prepare a checkout plan from [`Value`] `input` in [`plan::State`] via [`prepare_with_overlay`] without an import overlay.
#[inline]
pub(super) fn prepare(
    input: &Value,
    state: &mut plan::State,
    snapshots: Option<&crate::workspace::snapshots::State>,
) -> io::Result<Value> {
    prepare_with_overlay(input, state, snapshots, None)
}
/// Prepare a checkout plan from `input` using optional workspace `snapshots` and import `overlay`.
pub(super) fn prepare_with_overlay(
    input: &Value,
    state: &mut plan::State,
    snapshots: Option<&crate::workspace::snapshots::State>,
    overlay: Option<&crate::command_import::Overlay>,
) -> io::Result<Value> {
    let request = parse_request(input)?;
    let mut total = 0;
    let mut compressed = 0;
    let target = sources::load_with_overlay(
        &request.objects_directory,
        &request.target,
        &mut total,
        &mut compressed,
        overlay,
    )?;
    let current = current::load_with_overlay(
        &request.current,
        &request.objects_directory,
        &mut total,
        &mut compressed,
        snapshots,
        overlay,
    )?;
    let mut merged_bodies = Vec::new();
    let rows = merge::rows(
        &request,
        &target,
        &current,
        &mut merged_bodies,
        &mut (&mut total, &mut compressed),
        overlay,
    )?;
    let statuses = statuses(&request, &target, &current);
    let retained = retain_inputs(&request, target, &current, merged_bodies);
    let plan = plan::Plan {
        bodies: retained.0,
        target: request.target.files,
        target_indices: retained.1,
        current: retained.2,
        has_conflicts: has_conflicts(&rows),
        statuses,
        merge_rows: rows,
        other: None,
    };
    state.retain(plan, input, &request.snapshot_directory)
}
/// Return `true` when any three-way merge row in `rows` reports a text or binary conflict.
#[inline]
fn has_conflicts(rows: &[Value]) -> bool {
    rows.iter()
        .any(|row| row.get("conflictPlanIndex").is_some() || row["isBinaryConflict"] == true)
}
/// Deserialize and validate a [`wire::Prepare`] request from `input`.
#[inline]
fn parse_request(input: &Value) -> io::Result<wire::Prepare> {
    let request = serde::Deserialize::deserialize(input).map_err(io::Error::other)?;
    validate(&request)?;
    Ok(request)
}
/// Validate snapshot directory emptiness, manifest file paths, and count bounds on `request`.
fn validate(request: &wire::Prepare) -> io::Result<()> {
    if !request.snapshot_directory.is_absolute()
        || !fs::symlink_metadata(&request.snapshot_directory)?.is_dir()
        || fs::read_dir(&request.snapshot_directory)?.next().is_some()
    {
        return Err(invalid("checkout private directory must be ordinary empty"));
    }
    if invalid_manifest_files(&request.target.files)
        || request.base.as_ref().is_some_and(|base| invalid_manifest_files(&base.files))
        || request.current.len() > 4096
        || !request.objects_directory.is_absolute()
        || request.current
            .iter()
            .any(|file| file.relative_path.trim().is_empty())
    {
        return Err(invalid("checkout prepare path/count limit"));
    }
    if request.packed_bodies && request.base.is_none() {
        return Err(invalid("packed bodies require a merge base"));
    }
    Ok(())
}
#[inline]
fn invalid_manifest_files(files: &[wire::Manifest]) -> bool {
    files.len() > 4096
        || files
            .iter()
            .any(|file| file.relative_path.trim().is_empty())
}
fn retain_inputs(
    request: &wire::Prepare,
    target: Vec<Vec<u8>>,
    current: &[current::Loaded],
    merged_bodies: Vec<plan::Body>,
) -> (Vec<plan::Body>, Vec<usize>, Vec<plan::Current>) {
    let mut bodies = Vec::with_capacity(target.len() + current.len() + merged_bodies.len());
    bodies.extend(target.into_iter().map(plan::Body::new));
    let target_indices = (0..bodies.len()).collect::<Vec<_>>();
    let mut current_files = Vec::with_capacity(current.len());
    for (current_wire, file) in request.current.iter().zip(current) {
        let plan_index = bodies.len();
        bodies.push(plan::Body::new(file.normalized.clone()));
        current_files.push(plan::Current {
            relative_path: current_wire.relative_path.trim().to_owned(),
            path: current_wire.path.clone(),
            protected: current_wire.protected,
            plan_index,
            shares_buffer: file.raw == file.normalized,
            raw_hash: current_wire.snapshot_hash.trim().to_owned(),
        });
    }
    bodies.extend(merged_bodies);
    (bodies, target_indices, current_files)
}
fn statuses(
    request: &wire::Prepare,
    target: &[Vec<u8>],
    current: &[current::Loaded],
) -> Vec<Value> {
    let mut positions = HashMap::with_capacity(request.current.len());
    for (index, file) in request.current.iter().enumerate() {
        positions.entry(file.relative_path.trim()).or_insert(index);
    }
    request.target.files
        .iter()
        .enumerate()
        .map(|(index, file)| {
            let path = file.relative_path.trim();
            let equal = positions
                .get(path)
                .is_some_and(|&position| current[position].raw == target[index]);
            json!({"relativePath":path,"status":if equal{"unchanged"}else{"updated"}})
        })
        .collect()
}
