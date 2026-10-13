use super::{Prepared, Record, invalid, merge};
use serde_json::Value;
use std::{collections::HashSet, io};

pub(super) fn validate(record: &Record, prepared: &Prepared) -> io::Result<()> {
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
    for row in
        record.context["versions"].as_array().ok_or_else(|| invalid("command merge versions"))?
    {
        reject_dependents(&row[1], &identities)?;
    }
    let snapshots = prepared.pending
        .iter()
        .zip(&prepared.materials)
        .map(|(input, material)| merge::snapshot::Input {
            identity: &input.identity,
            model: &input.model,
            material,
            remote: &input.remote,
        })
        .collect::<Vec<_>>();
    let versions = merge::snapshot::preflight(&record.request.root, &snapshots)?;
    validate_finalization(record, prepared, &versions)
}

fn reject_dependents(version: &Value, identities: &HashSet<&str>) -> io::Result<()> {
    for field in ["dependencies", "devDependencies"] {
        for dependency in
            version[field].as_array().ok_or_else(|| invalid("command merge dependencies"))?
        {
            let id = &dependency["id"];
            let identity = format!(
                "{}/{}",
                id["scope"].as_str().unwrap_or_default(),
                id["name"].as_str().unwrap_or_default(),
            );
            if identities.contains(identity.as_str()) {
                return Err(invalid("command merge dependent snap cascade"));
            }
        }
    }
    Ok(())
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
            directory: &input.directory,
            hash: &input.remote,
            version,
        })
        .collect::<Vec<_>>();
    let roots =
        record.context["workspace"]["teambit.dependencies/dependency-resolver"]["rootComponents"]
            .as_bool()
            .unwrap_or(false);
    merge::finalization::prepare(&record.request.root, &inputs, roots)?;
    Ok(())
}
