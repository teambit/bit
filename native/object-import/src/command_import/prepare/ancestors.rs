//! `collectParents` imports the parent Versions and their immutable source closure.
use super::{PreparedImport, Target, invalid, read_model, receive};
use crate::command_import::lane::Id;
use serde_json::Value;
use std::{collections::HashSet, io, path::Path};

pub(super) fn collect(
    plan: &mut PreparedImport,
    directory: &Path,
    target: &Target,
) -> io::Result<()> {
    collect_target(plan, directory, target, None)
}

fn collect_target(
    plan: &mut PreparedImport,
    directory: &Path,
    target: &Target,
    requested: Option<&str>,
) -> io::Result<()> {
    let model = read_model(plan, directory, target)?
        .ok_or_else(|| invalid("import history component absent"))?;
    let head = requested
        .or_else(|| ref_str(&model["head"]))
        .ok_or_else(|| invalid("import history head absent"))?;
    let mut pending = vec![head.to_owned()];
    let mut seen = HashSet::new();
    while let Some(hash) = pending.pop() {
        if !seen.insert(hash.clone()) {
            continue;
        }
        if seen.len() > 16384 {
            return Err(invalid("import history closure limit"));
        }
        let version = plan.capture
            .object(directory, &hash, "Version")?
            .and_then(|object| object.value)
            .ok_or_else(|| invalid("import history Version absent"))?;
        append_parents(&version, &mut pending)?;
        receive(plan, directory, target, &model, &hash, false)?;
    }
    Ok(())
}

fn append_parents(version: &Value, pending: &mut Vec<String>) -> io::Result<()> {
    for parent in version["parents"]
        .as_array()
        .into_iter()
        .flatten()
    {
        let hash = ref_str(parent).ok_or_else(|| invalid("import history parent"))?;
        crate::merge_history::hash(hash)?;
        pending.push(hash.to_owned());
    }
    Ok(())
}

fn ref_str(value: &Value) -> Option<&str> {
    value
        .as_str()
        .or_else(|| value["ref"].as_str())
        .or_else(|| value["hash"].as_str())
}

impl PreparedImport {
    pub(crate) fn collect_lane_history(&mut self, id: &Id, targets: &[Target]) -> io::Result<()> {
        let remotes = self.environment.remotes.clone();
        let directory = super::remote(self, &remotes, &id.scope)?;
        for target in targets {
            collect_target(self, &directory, target, Some(&target.version))?;
        }
        self.validate()
    }
}
