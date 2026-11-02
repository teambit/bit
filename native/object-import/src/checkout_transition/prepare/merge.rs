//! Base source loading and three-way file merge execution ([`rows`]) for checkout preparation.

use super::{
    super::{invalid, plan, wire},
    current, sources,
};
use serde_json::{Value, json};
use sha1::{Digest, Sha1};
use std::{collections::HashMap, io};
/// Load required base `Source` blobs and compute three-way merge rows for `request`.
pub(super) fn rows(
    request: &wire::Prepare,
    target: &[Vec<u8>],
    current: &[current::Loaded],
    bodies: &mut Vec<plan::Body>,
    budgets: &mut (&mut usize, &mut usize),
    overlay: Option<&crate::command_import::Overlay>,
) -> io::Result<Vec<Value>> {
    let Some(base) = &request.base else {
        return Ok(Vec::new());
    };
    let needed = required_base(request, base, current);
    let base_bodies = sources::selected(
        &request.objects_directory,
        base,
        &needed,
        budgets.0,
        budgets.1,
        overlay,
    )?;
    let labels = request.labels.as_ref().ok_or_else(|| invalid("checkout merge labels missing"))?;
    let input = json!({"objectsDirectory":request.objects_directory,"labels":{"current":labels.current,"other":labels.other},"base":base.files.iter().map(|file|json!({"path":file.relative_path.trim(),"hash":file.hash.trim()})).collect::<Vec<_>>(),"other":request.target.files.iter().map(|file|json!({"path":file.relative_path.trim(),"hash":file.hash.trim()})).collect::<Vec<_>>(),"current":request.current.iter().map(|file|json!({"path":file.relative_path.trim(),"source":{"hash":file.snapshot_hash.trim()}})).collect::<Vec<_>>()});
    let prepared = crate::merge_history::merge::Prepared {
        base: base_bodies
            .iter()
            .map(Option::as_deref)
            .collect(),
        other: target
            .iter()
            .map(Vec::as_slice)
            .collect(),
        current: current
            .iter()
            .map(|file| file.normalized.as_slice())
            .collect(),
    };
    let merged = crate::merge_history::merge::verified(input, &prepared)?;
    let rows = merged["files"].as_array().ok_or_else(|| invalid("checkout merge rows missing"))?;
    let mut output = Vec::with_capacity(rows.len());
    for row in rows {
        let mut row = row.clone();
        retain(&mut row, bodies, target.len().saturating_add(current.len()))?;
        output.push(row);
    }
    Ok(output)
}
/// Extract `output` and `conflict` byte buffers from `row` into `bodies` and record their plan indices.
#[inline]
fn retain(row: &mut Value, bodies: &mut Vec<plan::Body>, offset: usize) -> io::Result<()> {
    for (field, output) in [("output", "outputPlanIndex"), ("conflict", "conflictPlanIndex")] {
        retain_field(row, bodies, field, output, offset)?;
    }
    Ok(())
}
/// Remove string `field` from `row`, append its bytes to `bodies`, and record `output` plan index.
#[inline]
fn retain_field(
    row: &mut Value,
    bodies: &mut Vec<plan::Body>,
    field: &str,
    output: &str,
    offset: usize,
) -> io::Result<()> {
    let removed = row
        .as_object_mut()
        .ok_or_else(|| invalid("checkout merge row"))?
        .shift_remove(field);
    if let Some(Value::String(text)) = removed {
        if field == "conflict" && text.is_empty() {
            return Ok(());
        }
        let index = offset.saturating_add(bodies.len());
        bodies.push(plan::Body::new(text.into_bytes()));
        row[output] = json!(index);
    }
    Ok(())
}

/// Determine which `base` manifest files must be loaded because `current` and `request.target` differ.
#[inline]
fn required_base(
    request: &wire::Prepare,
    base: &wire::Version,
    current: &[current::Loaded],
) -> Vec<bool> {
    let base_indices: HashMap<_, _> = base.files
        .iter()
        .enumerate()
        .map(|(index, file)| (file.relative_path.trim(), index))
        .collect();
    let other: HashMap<_, _> = request.target.files
        .iter()
        .map(|file| (file.relative_path.trim(), file.hash.as_str()))
        .collect();
    let mut needed = vec![false; base.files.len()];
    for (file, loaded) in request.current.iter().zip(current) {
        let relative_path = file.relative_path.trim();
        let Some(&index) = base_indices.get(relative_path) else {
            continue;
        };
        let Some(&other_hash) = other.get(relative_path) else {
            continue;
        };
        let current_hash = crate::validate::hexadecimal(&Sha1::digest(&loaded.normalized));
        needed[index] = !same_hash(&current_hash, &base.files[index].hash)
            && !same_hash(&current_hash, other_hash);
    }
    needed
}

#[inline]
fn same_hash(left: &str, right: &str) -> bool {
    left.trim().eq_ignore_ascii_case(right.trim())
}
