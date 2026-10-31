#[cfg(test)]
mod tests;

use super::{Prepared, Selected, capture, invalid, merge, planning};
use serde_json::{Value, json};
use std::io;

pub(super) fn fast_forward(
    prepared: &mut Prepared,
    planned: &planning::Planned,
    context: &Value,
) -> io::Result<()> {
    if prepared.pending.is_empty() {
        return Ok(());
    }
    for material in &planned.materials {
        let identity = material.output["id"]
            .as_str()
            .and_then(|id| id.trim().rsplit_once('@'))
            .map(|(identity, _)| identity.trim())
            .filter(|identity| !identity.is_empty())
            .ok_or_else(|| invalid("command FF identity"))?;
        let current = planned.captured
            .iter()
            .find(|row| row.target.identity == identity)
            .ok_or_else(|| invalid("command FF current"))?;
        let prefix = binding_prefix(current, context)?;
        append_fast_forward(prepared, material, current, identity, &prefix)?;
    }
    Ok(())
}

fn binding_prefix(current: &capture::Captured, context: &Value) -> io::Result<String> {
    if !current.added {
        return current.target.current["bindingPrefix"]
            .as_str()
            .map(str::to_owned)
            .ok_or_else(|| invalid("command FF prefix"));
    }
    let model = super::super::repository::model(context, &current.target.identity)?
        .ok_or_else(|| invalid("command FF model"))?;
    Ok(model["bindingPrefix"]
        .as_str()
        .map(str::trim)
        .filter(|prefix| !prefix.is_empty())
        .map_or_else(
            || {
                let owner = current.target.identity
                    .split(['.', '/'])
                    .next()
                    .unwrap_or_default()
                    .trim();
                format!("@{owner}")
            },
            str::to_owned,
        ))
}

fn append_fast_forward(
    prepared: &mut Prepared,
    material: &super::super::materialization::Prepared,
    current: &capture::Captured,
    identity: &str,
    prefix: &str,
) -> io::Result<()> {
    prepared.policy
        .as_mut()
        .ok_or_else(|| invalid("command FF policy state"))?
        .rows
        .push(super::super::policy::Row {
            identity: identity.into(),
            baseline: super::super::policy::Baseline {
                scope_only: current.hidden,
                directory: current.target.directory.clone(),
                version: material.version_name.clone(),
                current: current.target.current.clone(),
                versions: [
                    material.version.clone(),
                    material.version.clone(),
                    material.version.clone(),
                ],
                package_name: super::super::policy::package_name(identity, prefix),
            },
            files: sorted_files(&material.files),
            merged: json!({}),
            projected: Value::Null,
            ours_conflict: false,
            fast_forward: true,
            receipts: super::super::policy::Receipts::default(),
        });
    Ok(())
}

pub(super) fn divergent(
    prepared: &mut Prepared,
    selected: &Selected,
    current: &capture::Captured,
    material: &merge::Prepared,
    scope_only: bool,
    labels: &Value,
) -> io::Result<()> {
    let prefix = current.target.current["bindingPrefix"]
        .as_str()
        .ok_or_else(|| invalid("command binding prefix"))?;
    prepared.policy
        .as_mut()
        .ok_or_else(|| invalid("command merge policy state"))?
        .rows
        .push(super::super::policy::Row {
            identity: current.target.identity.clone(),
            baseline: super::super::policy::Baseline {
                scope_only,
                directory: current.target.directory.clone(),
                version: current.target.version.clone(),
                current: current.target.current.clone(),
                versions: selected.versions.clone(),
                package_name: super::super::policy::package_name(&current.target.identity, prefix),
            },
            files: if material.no_write() {
                current.target.files.clone()
            } else {
                sorted_files(&material.files)
            },
            merged: json!({}),
            projected: Value::Null,
            ours_conflict: material.no_write(),
            fast_forward: false,
            receipts: super::super::policy::Receipts {
                dependencies: None,
                configuration: json!({"labels":labels}),
            },
        });
    Ok(())
}

fn sorted_files(files: &[Value]) -> Vec<String> {
    let mut paths = files
        .iter()
        .filter_map(|file| file["relativePath"].as_str().map(str::to_owned))
        .collect::<Vec<_>>();
    paths.sort_by(|left, right| left.encode_utf16().cmp(right.encode_utf16()));
    paths
}
