//! Stage-grouped component completion permutation validation ([`permutation`], `mergePlanOrder`).

use super::invalid;
use serde_json::Value;
use std::{collections::HashSet, io};
/// Validates stage-grouped component completion ordering and returns the index permutation.
pub(super) fn permutation(input: &Value, groups: &[Value], count: usize) -> io::Result<Vec<usize>> {
    if count > 4096 {
        return Err(invalid("merge order range"));
    }
    let observed = input["groups"].as_array().ok_or_else(|| invalid("merge order groups"))?;
    if observed.len() != groups.len() {
        return Err(invalid("merge order group count"));
    }
    let mut permutation = (0..count).collect::<Vec<_>>();
    let mut assigned = HashSet::with_capacity(count);
    for (actual, expected) in observed.iter().zip(groups) {
        apply_stage(actual, expected, &mut permutation, &mut assigned)?;
    }
    Ok(permutation)
}

fn apply_stage(
    actual: &Value,
    expected: &Value,
    permutation: &mut [usize],
    assigned: &mut HashSet<usize>,
) -> io::Result<()> {
    let expected_stage = expected["stage"].as_str().map(str::trim);
    if actual["stage"].as_str().map(str::trim) != expected_stage {
        return Err(invalid("merge order stage"));
    }
    let rows = indices(&expected["loads"], true)?;
    let selected = indices(&actual["order"], false)?;
    if rows.len() != selected.len() || (expected_stage == Some("modified") && rows != selected) {
        return Err(invalid("merge invalid completion permutation"));
    }
    if rows.is_empty() {
        return Ok(());
    }
    let mut remaining = rows
        .iter()
        .copied()
        .collect::<HashSet<_>>();
    if remaining.len() != rows.len()
        || selected
            .iter()
            .any(|row| !remaining.remove(row))
    {
        return Err(invalid("merge invalid completion permutation"));
    }
    for (destination, source) in rows.into_iter().zip(selected) {
        if !assigned.insert(destination) {
            return Err(invalid("merge invalid completion permutation"));
        }
        *permutation.get_mut(destination).ok_or_else(|| invalid("merge order range"))? = source;
    }
    Ok(())
}

#[inline]
fn indices(value: &Value, loads: bool) -> io::Result<Vec<usize>> {
    value
        .as_array()
        .filter(|rows| rows.len() <= 4096)
        .ok_or_else(|| invalid("merge order array"))?
        .iter()
        .map(|row| {
            let value = if loads { &row["row"] } else { row };
            value
                .as_u64()
                .and_then(|index| usize::try_from(index).ok())
                .ok_or_else(|| invalid("merge order index"))
        })
        .collect()
}
