mod cache_guard;

use super::{Prepared, Record, invalid, merge};
use serde_json::Value;
use std::{collections::HashSet, io};

pub(super) fn validate(
    record: &Record,
    prepared: &mut Prepared,
    targets: &[super::super::materialization::Prepared],
    captured: &[super::super::capture::Captured],
) -> io::Result<()> {
    if prepared.pending.is_empty() {
        return Ok(());
    }
    if prepared.pending.len() != prepared.materials.len() {
        return Err(invalid("command mixed merge conflict autosnap"));
    }
    let identities = prepared.pending
        .iter()
        .map(|input| input.identity.as_str())
        .collect::<HashSet<_>>();
    for target in targets {
        validate_target(&target.version)?;
        let identity = target.output["id"]
            .as_str()
            .and_then(|id| id.rsplit_once('@'))
            .ok_or_else(|| invalid("command fast-forward identity"))?
            .0;
        if !prepared.policy.as_ref().is_some_and(|policy| policy.dependencies_ready) {
            prepared.proofs.extend(cache_guard::verify(record, captured, target, identity)?);
        }
    }
    if record.request.internal_snapshot_preview {
        return Ok(());
    }
    validate_dependents(record, &identities)?;
    let snapshots = prepared.pending
        .iter()
        .zip(&prepared.materials)
        .map(|(input, material)| merge::snapshot::Input {
            identity: &input.identity,
            model: &input.model,
            material,
            remote: &input.remote,
            lane: record.context.get("lane"),
        })
        .collect::<Vec<_>>();
    let versions = merge::snapshot::preflight(&record.request.root, &snapshots)?;
    validate_finalization(record, prepared, &versions)
}

fn validate_dependents(record: &Record, identities: &HashSet<&str>) -> io::Result<()> {
    if record.request.internal_snapshot_preview {
        return Ok(());
    }
    for row in
        record.context["versions"].as_array().ok_or_else(|| invalid("command merge versions"))?
    {
        reject_dependents(&row[1], identities)?;
    }
    Ok(())
}

fn reject_dependents(version: &Value, identities: &HashSet<&str>) -> io::Result<()> {
    for field in ["dependencies", "devDependencies"] {
        for dependency in
            version[field].as_array().ok_or_else(|| invalid("command merge dependencies"))?
        {
            let identity = dependency_identity(&dependency["id"]);
            if identities.contains(identity.as_str()) {
                return Err(invalid("command merge dependent snap cascade"));
            }
        }
    }
    Ok(())
}

fn dependency_identity(id: &Value) -> String {
    if let Some(raw) = id.as_str().map(str::trim) {
        return raw
            .rsplit_once('@')
            .map_or(raw, |(bare, _)| bare.trim())
            .to_owned();
    }
    let raw_name = id["name"].as_str().map_or("", str::trim);
    let name = raw_name.rsplit_once('@').map_or(raw_name, |(bare, _)| bare.trim());
    format!("{}/{name}", id["scope"].as_str().map_or("", str::trim))
}

fn validate_finalization(
    record: &Record,
    prepared: &Prepared,
    versions: &[Value],
) -> io::Result<()> {
    let inputs = prepared.pending
        .iter()
        .zip(versions)
        .map(|(input, version)| merge::finalization::Input {
            identity: &input.identity,
            directory: if prepared.publication.removed
                .iter()
                .any(|row| row.identity == input.identity)
            {
                ""
            } else {
                &input.directory
            },
            hash: &input.remote,
            semantic_version: None,
            version,
        })
        .collect::<Vec<_>>();
    let roots = record.context["workspace"]
        .as_object()
        .and_then(|map| {
            map.iter()
                .find_map(|(key, val)| {
                    (key == "teambit.dependencies/dependency-resolver"
                        || key.starts_with("teambit.dependencies/dependency-resolver@"))
                    .then_some(val)
                })
        })
        .and_then(|resolver| resolver["rootComponents"].as_bool())
        .unwrap_or(false);
    merge::finalization::prepare(&record.request.root, &inputs, roots, &[])?;
    Ok(())
}

fn validate_target(version: &Value) -> io::Result<()> {
    let files = version["files"].as_array().ok_or_else(|| invalid("command target files"))?;
    merge::snapshot::validate_application_files(files)
}

#[cfg(test)]
mod tests;
