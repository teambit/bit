use super::{Prepared, Selected, capture, invalid, merge, planning};
use serde_json::{Value, json};
use std::io;

pub(super) fn fast_forward(prepared: &mut Prepared, planned: &planning::Planned) -> io::Result<()> {
    if prepared.pending.is_empty() {
        return Ok(());
    }
    for material in &planned.materials {
        let identity = material.output["id"]
            .as_str()
            .and_then(|id| id.rsplit_once('@'))
            .ok_or_else(|| invalid("command FF identity"))?
            .0;
        let current = planned.captured
            .iter()
            .find(|row| row.target.identity == identity)
            .ok_or_else(|| invalid("command FF current"))?;
        append_fast_forward(prepared, material, current, identity)?;
    }
    Ok(())
}

fn append_fast_forward(
    prepared: &mut Prepared,
    material: &super::super::materialization::Prepared,
    current: &capture::Captured,
    identity: &str,
) -> io::Result<()> {
    let prefix = current.target.current["bindingPrefix"]
        .as_str()
        .ok_or_else(|| invalid("command FF prefix"))?;
    prepared.policy
        .as_mut()
        .unwrap()
        .rows
        .push(super::super::policy::Row {
            identity: identity.into(),
            baseline: super::super::policy::Baseline {
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
            detected: None,
        });
    Ok(())
}

pub(super) fn divergent(
    prepared: &mut Prepared,
    selected: &Selected,
    current: &capture::Captured,
    material: &merge::Prepared,
) -> io::Result<()> {
    let prefix = current.target.current["bindingPrefix"]
        .as_str()
        .ok_or_else(|| invalid("command binding prefix"))?;
    prepared.policy
        .as_mut()
        .unwrap()
        .rows
        .push(super::super::policy::Row {
            identity: current.target.identity.clone(),
            baseline: super::super::policy::Baseline {
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
            detected: None,
        });
    Ok(())
}

fn sorted_files(files: &[Value]) -> Vec<String> {
    let mut paths = files
        .iter()
        .map(|file| {
            file["relativePath"]
                .as_str()
                .unwrap()
                .to_owned()
        })
        .collect::<Vec<_>>();
    paths.sort_by(|left, right| left.encode_utf16().cmp(right.encode_utf16()));
    paths
}

#[cfg(test)]
mod tests;
