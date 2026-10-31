mod autotag;
mod dependencies;
mod future;
#[cfg(test)]
mod future_tests;
mod increment;
mod journal;
mod objects;
#[cfg(test)]
mod policy_tests;
mod source;
#[cfg(test)]
mod tests;
mod wire;

use serde::Deserialize;
use serde_json::{Value, json};
use sha1::{Digest, Sha1};
use std::{collections::HashMap, fs, io, path::Path};

const MAX_RAW: usize = 32 * 1024 * 1024;
const MAX_OBJECTS: usize = 4096;

#[derive(Default)]
pub(crate) struct State {
    plans: HashMap<String, Plan>,
    revision: u64,
    transaction: journal::State,
    repository: journal::State,
}

struct Plan {
    objects: Vec<objects::Prepared>,
}

pub(crate) fn apply(kind: &str, input: Value, state: &mut State) -> io::Result<Value> {
    match kind {
        "snapshotSerialize" => serialize(&input, state),
        "snapshotVersionIdentity" => version_identity(input),
        "snapshotAutoTag" => autotag::plan(&input),
        "snapshotFutureVersions" => future::plan(input),
        "snapshotDependencyUpdates" => dependencies::plan(&input),
        "snapshotCommit" => commit(input, state),
        "snapshotTransactionBegin" => begin(input, state, false),
        "snapshotRepositoryBegin" => begin(input, state, true),
        "snapshotTransactionReceipt" => state.transaction.receipt(input),
        "snapshotRepositoryReceipt" => state.repository.receipt(input),
        _ => Err(invalid("unknown snapshot operation")),
    }
}

fn object_bytes(objects: &[objects::Prepared]) -> usize {
    objects
        .iter()
        .map(|object| object.compressed.len() + object.inflated_size)
        .sum()
}

fn serialize(input: &Value, state: &mut State) -> io::Result<Value> {
    let request = wire::Serialize::deserialize(input).map_err(io::Error::other)?;
    if request.objects.len() > MAX_OBJECTS {
        return Err(invalid("snapshot object count limit"));
    }
    directory(&request.staging_directory)?;
    let retained_count: usize = state.plans
        .values()
        .map(|plan| plan.objects.len())
        .sum();
    if state.plans.len() >= MAX_OBJECTS
        || retained_count.saturating_add(request.objects.len()) > MAX_OBJECTS
    {
        return Err(invalid("snapshot retained manifest budget"));
    }
    let objects = objects::prepare(request.objects, request.pretty)?;
    let retained: usize = state.plans
        .values()
        .map(|plan| object_bytes(&plan.objects))
        .sum();
    if retained
        .checked_add(object_bytes(&objects))
        .is_none_or(|size| size > MAX_RAW * 2)
    {
        return Err(invalid("snapshot retained object budget"));
    }
    let token = state.token(&serde_json::to_vec(&input).map_err(io::Error::other)?)?;
    let objects = objects::paths(objects, &request.staging_directory, &token);
    let manifest = objects::manifest(&objects);
    let output = json!({"token":token,"count":objects.len(),"objects":manifest});
    if serde_json::to_vec(&output).map_err(io::Error::other)?.len() > 4 * 1024 * 1024 {
        return Err(invalid("snapshot response limit"));
    }
    for object in &objects {
        object.spool()?;
    }
    state.plans.insert(token, Plan { objects });
    Ok(output)
}

fn commit(input: Value, state: &State) -> io::Result<Value> {
    let request: wire::Commit = serde_json::from_value(input).map_err(io::Error::other)?;
    path(&request.objects_directory)?;
    let plan =
        state.plans.get(request.token.trim()).ok_or_else(|| invalid("stale snapshot token"))?;
    let owner = request.owner.map(|owner| (owner.uid, owner.gid));
    let store = crate::store::Store::new(request.objects_directory, owner)?;
    let mut written = Vec::new();
    for object in &plan.objects {
        if store.write(&object.hash, &object.compressed).is_err() {
            break;
        }
        written.push(json!({"hash":object.hash,"inflatedSize":object.inflated_size,"compressedSize":object.compressed.len()}));
    }
    Ok(
        json!({"completed":written.len(),"count":plan.objects.len(),"failed":written.len()!=plan.objects.len(),"written":written}),
    )
}

impl State {
    fn token(&mut self, bytes: &[u8]) -> io::Result<String> {
        let Some(revision) = self.revision.checked_add(1) else {
            self.plans.clear();
            return Err(invalid("snapshot revision limit"));
        };
        self.revision = revision;
        let mut digest = Sha1::new();
        digest.update(revision.to_be_bytes());
        digest.update(bytes);
        Ok(crate::validate::hexadecimal(&digest.finalize()))
    }
}

fn directory(directory: &Path) -> io::Result<()> {
    path(directory)?;
    let metadata = fs::symlink_metadata(directory)?;
    if !metadata.is_dir()
        || metadata.file_type().is_symlink()
        || fs::read_dir(directory)?.next().is_some()
    {
        return Err(invalid("snapshot staging directory must be ordinary and empty"));
    }
    Ok(())
}

fn path(path: &Path) -> io::Result<()> {
    let text = path.to_str().ok_or_else(|| invalid("snapshot nonUTF8 path"))?;
    if !path.is_absolute()
        || text.trim().is_empty()
        || text.len() > 32768
        || text.contains('\0')
        || path
            .components()
            .any(|comp| matches!(comp, std::path::Component::ParentDir))
    {
        return Err(invalid("snapshot absolute path required"));
    }
    Ok(())
}

fn invalid(message: &str) -> io::Error {
    io::Error::new(io::ErrorKind::InvalidData, message)
}

fn begin(input: Value, state: &mut State, repository: bool) -> io::Result<Value> {
    let token = state.token(&serde_json::to_vec(&input).map_err(io::Error::other)?)?;
    if repository {
        state.repository.begin(input, token, true)
    } else {
        state.transaction.begin(input, token, false)
    }
}

fn version_identity(input: Value) -> io::Result<Value> {
    #[derive(serde::Deserialize)]
    #[serde(deny_unknown_fields)]
    struct Request {
        fields: crate::js_json::Value,
    }
    let request: Request = serde_json::from_value(input).map_err(io::Error::other)?;
    let semantic: crate::snapshot_projection::Semantic =
        crate::snapshot_projection::semantic(&request.fields)?;
    Ok(
        json!({"hash":semantic.hash,"bytes":semantic.bytes.len(),"configAssignments":semantic.config_assignments}),
    )
}

/// The next npm version after a published tag, preserving its prerelease identifier.
pub fn next_published_version(parts: &Value) -> io::Result<String> {
    let prerelease =
        parts["prerelease"].as_array().ok_or_else(|| invalid("registry semver parts"))?;
    let identifier = prerelease
        .first()
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|id| !id.is_empty());
    let release = if prerelease.is_empty() { "patch" } else { "prerelease" };
    increment::format(&increment::increment(parts, release, identifier)?)
}
