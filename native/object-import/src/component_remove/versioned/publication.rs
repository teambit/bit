//! Compose independent scope removals ([`publish`]) against one retained index and lane preimage.

use super::{Change, VersionedPlan, history, invalid, outbound};
use serde_json::Value;
use std::{collections::HashSet, fs, io, path::PathBuf};

/// Publishes all scope object deletions, index updates, and lane history writes across [`VersionedPlan`] `plans`.
pub(in crate::component_remove) fn publish(
    plans: &[VersionedPlan],
    _track: bool,
) -> io::Result<()> {
    let changes = changes(plans)?;
    write_lanes(plans)?;
    let mut removed = HashSet::new();
    for plan in plans {
        for object in &plan.objects {
            if removed.insert(&object.path) {
                remove_object(&object.path)?;
            }
        }
    }
    for (path, bytes) in changes {
        fs::write(path, bytes)?;
    }
    for plan in plans {
        if let Some(state) = &plan.history {
            history::write(state)?;
        }
    }
    Ok(())
}
/// Merge and serialize all `index.json` [`Change`] updates across [`VersionedPlan`] `plans` against a single preimage per file.
fn changes(plans: &[VersionedPlan]) -> io::Result<Vec<(PathBuf, Vec<u8>)>> {
    let mut grouped: Vec<(&Change, Value)> = Vec::new();
    for change in plans.iter().map(|plan| &plan.index) {
        let after =
            crate::parse_jsonc(change.after.as_ref().ok_or_else(|| invalid("scope update"))?)?;
        if let Some((original, merged)) = grouped
            .iter_mut()
            .find(|(entry, _)| entry.path == change.path)
        {
            if original.before != change.before {
                return Err(invalid("scope removal preimages differ"));
            }
            intersect(merged, &after)?;
        } else {
            grouped.push((change, after));
        }
    }
    grouped
        .into_iter()
        .map(|(change, value)| {
            let mut bytes = serde_json::to_vec_pretty(&value)?;
            if change.after
                .as_ref()
                .is_some_and(|bytes| bytes.ends_with(b"\n"))
            {
                bytes.push(b'\n');
            }
            Ok((change.path.clone(), bytes))
        })
        .collect()
}
/// Retain only component index entries present in both `value` and `after`.
#[inline]
fn intersect(value: &mut Value, after: &Value) -> io::Result<()> {
    let (rows, retained) = if let Some(rows) = value.as_array_mut() {
        (rows, after.as_array().ok_or_else(|| invalid("staged removal shape"))?)
    } else {
        (
            value["components"].as_array_mut().ok_or_else(|| invalid("scope removal shape"))?,
            after["components"].as_array().ok_or_else(|| invalid("scope removal shape"))?,
        )
    };
    rows.retain(|row| retained.contains(row));
    Ok(())
}
/// Remove all [`VersionedPlan`] components in `plans` from the shared active `Lane` object and write it to disk.
fn write_lanes(plans: &[VersionedPlan]) -> io::Result<()> {
    let Some(first) = plans.iter().find_map(|plan| plan.workspace.lane.as_ref()) else {
        return Ok(());
    };
    for lane in plans.iter().filter_map(|plan| plan.workspace.lane.as_ref()) {
        if lane.path != first.path || lane.before != first.before {
            return Err(invalid("lane removal preimages differ"));
        }
    }
    let mut value = first.value.clone();
    let rows =
        value["components"].as_array_mut().ok_or_else(|| invalid("lane component removal"))?;
    rows.retain(|row| {
        let (entry_scope, entry_name) = crate::component_remove::lane::lane_id_parts(&row["id"]);
        !plans
            .iter()
            .any(|plan| {
                let identity = plan.workspace.identity.trim();
                let (scope, name) = identity
                    .split_once('/')
                    .map_or(("", identity), |(scope, name)| (scope.trim(), name.trim()));
                entry_name == name && (entry_scope == scope || entry_scope.is_empty())
            })
    });
    fs::write(&first.path, outbound::encode_object(&first.hash, "Lane", &value)?)
}
/// Remove a loose object file at `path` and prune its two-hex shard directory if now empty.
fn remove_object(path: &std::path::Path) -> io::Result<()> {
    match fs::remove_file(path) {
        Ok(()) => {}
        Err(error) if error.kind() == io::ErrorKind::NotFound => {}
        Err(error) => return Err(error),
    }
    let parent = path.parent().ok_or_else(|| invalid("object directory"))?;
    if fs::read_dir(parent).is_ok_and(|mut entries| entries.next().is_none()) {
        match fs::remove_dir(parent) {
            Ok(()) => {}
            Err(error)
                if matches!(
                    error.kind(),
                    io::ErrorKind::DirectoryNotEmpty | io::ErrorKind::NotFound,
                ) => {}
            Err(error) => return Err(error),
        }
    }
    Ok(())
}
