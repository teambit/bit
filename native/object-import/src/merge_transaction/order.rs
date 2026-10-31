use super::invalid;
use serde_json::Value;
use std::{collections::HashSet, io};
pub(super) fn permutation(input: &Value, groups: &[Value], count: usize) -> io::Result<Vec<usize>> {
    let observed = input["groups"].as_array().ok_or_else(|| invalid("merge order groups"))?;
    if observed.len() != groups.len() {
        return Err(invalid("merge order group count"));
    }
    let mut permutation = (0..count).collect::<Vec<_>>();
    for (actual, expected) in observed.iter().zip(groups) {
        if actual["stage"] != expected["stage"] {
            return Err(invalid("merge order stage"));
        }
        let rows = indices(&expected["loads"], true)?;
        let selected = indices(&actual["order"], false)?;
        let source = rows
            .iter()
            .copied()
            .collect::<HashSet<_>>();
        let selected_set = selected
            .iter()
            .copied()
            .collect::<HashSet<_>>();
        if rows.len() != selected.len()
            || source != selected_set
            || selected_set.len() != selected.len()
            || (expected["stage"] == "modified" && rows != selected)
        {
            return Err(invalid("merge invalid completion permutation"));
        }
        for (destination, source) in rows.into_iter().zip(selected) {
            *permutation.get_mut(destination).ok_or_else(|| invalid("merge order range"))? = source;
        }
    }
    Ok(permutation)
}

fn indices(value: &Value, loads: bool) -> io::Result<Vec<usize>> {
    value
        .as_array()
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
