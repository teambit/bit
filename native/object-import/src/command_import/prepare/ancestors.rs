//! `collectParents` imports the parent Versions and their immutable source closure.
//!
//! Walks parent hashes of imported component heads ([`collect`]) and stages their `Version` and `Source` objects.
use super::{PreparedImport, Target, invalid, read_model, receive};
use crate::command_import::lane::Id;
use serde_json::Value;
use std::{collections::HashSet, io, path::Path};

/// Collect and stage all parent `Version` and `Source` objects reachable from `target`'s head.
#[inline]
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
        .map(str::trim)
        .filter(|hash| !hash.is_empty())
        .or_else(|| ref_str(&model["head"]))
        .ok_or_else(|| invalid("import history head absent"))?;
    let mut pending = vec![head.to_owned()];
    let mut seen = HashSet::new();
    while let Some(hash) = pending.pop() {
        if seen.contains(&hash) {
            continue;
        }
        if seen.len() >= 16384 {
            return Err(invalid("import history closure limit"));
        }
        let version = plan.capture
            .object(directory, &hash, "Version")?
            .and_then(|object| object.value)
            .ok_or_else(|| invalid("import history Version absent"))?;
        append_parents(&version, &mut pending)?;
        receive(plan, directory, target, &model, &hash, false)?;
        seen.insert(hash);
    }
    Ok(())
}

#[inline]
fn append_parents(version: &Value, pending: &mut Vec<String>) -> io::Result<()> {
    let Some(parents) = version
        .get("parents")
        .filter(|value| !value.is_null())
    else {
        return Ok(());
    };
    let parents = parents.as_array().ok_or_else(|| invalid("import history parents"))?;
    pending.reserve(parents.len());
    for parent in parents {
        let hash = ref_str(parent).ok_or_else(|| invalid("import history parent"))?;
        crate::merge_history::hash(hash)?;
        pending.push(hash.to_owned());
    }
    Ok(())
}

#[inline]
fn ref_str(value: &Value) -> Option<&str> {
    value
        .as_str()
        .or_else(|| value["ref"].as_str())
        .or_else(|| value["hash"].as_str())
        .map(str::trim)
        .filter(|hash| !hash.is_empty())
}

impl PreparedImport {
    pub(crate) fn collect_lane_history(&mut self, id: &Id, targets: &[Target]) -> io::Result<()> {
        if targets.len() > 4096 {
            return Err(invalid("import history target limit"));
        }
        let remotes = self.environment.remotes.clone();
        let directory = super::remote(self, &remotes, &id.scope)?;
        for target in targets {
            collect_target(self, &directory, target, Some(&target.version))?;
        }
        self.validate()
    }
}
