//! Compose independent scope removals against one retained index and lane preimage.
use super::{Change, VersionedPlan, history, invalid, outbound};
use serde_json::Value;
use std::{collections::HashSet, fs, io, path::PathBuf};

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
fn intersect(value: &mut Value, after: &Value) -> io::Result<()> {
    if let Some(rows) = value.as_array_mut() {
        let retained = after.as_array().ok_or_else(|| invalid("staged removal shape"))?;
        rows.retain(|row| retained.contains(row));
    } else {
        let rows =
            value["components"].as_array_mut().ok_or_else(|| invalid("scope removal shape"))?;
        let retained =
            after["components"].as_array().ok_or_else(|| invalid("scope removal shape"))?;
        rows.retain(|row| retained.contains(row));
    }
    Ok(())
}
fn write_lanes(plans: &[VersionedPlan]) -> io::Result<()> {
    let Some(first) = plans.iter().find_map(|plan| plan.workspace.lane.as_ref()) else {
        return Ok(());
    };
    let mut value = first.value.clone();
    let rows =
        value["components"].as_array_mut().ok_or_else(|| invalid("lane component removal"))?;
    rows.retain(|row| {
        !plans
            .iter()
            .any(|plan| {
                let (scope, name) = plan.workspace.identity
                    .split_once('/')
                    .unwrap_or(("", &plan.workspace.identity));
                crate::component_remove::lane::matches_component_entry(row, scope, name)
            })
    });
    fs::write(&first.path, outbound::encode_object(&first.hash, "Lane", &value)?)
}
fn remove_object(path: &std::path::Path) -> io::Result<()> {
    fs::remove_file(path)?;
    let parent = path.parent().ok_or_else(|| invalid("object directory"))?;
    if fs::read_dir(parent)?.next().is_none() {
        fs::remove_dir(parent)?;
    }
    Ok(())
}
