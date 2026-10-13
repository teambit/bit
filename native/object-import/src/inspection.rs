pub(crate) use bitmap::normalize as normalize_bitmap;

mod bitmap;
mod compare;
mod diff;
mod files;
mod read;
mod wire;

use serde_json::{Value, json};
use sha1::{Digest, Sha1};
use std::{collections::HashMap, io};

const MAX_FILES: usize = 4096;
const MAX_BYTES: usize = 32 * 1024 * 1024;
#[derive(Default)]
pub(crate) struct State {
    plans: HashMap<String, Vec<read::File>>,
    revision: u64,
}
pub(crate) fn apply(kind: &str, input: Value, state: &mut State) -> io::Result<Value> {
    match kind {
        "inspectionBegin" => begin(&input, state, None),
        "inspectionDiff" => diff::plan(input, &state.plans),
        "inspectionCompare" => compare::plan(input),
        "inspectionFiles" => files::plan(input, &state.plans),
        "inspectionFinish" => {
            let request: wire::Token = serde_json::from_value(input).map_err(io::Error::other)?;
            state.plans.remove(&request.token).ok_or_else(|| invalid("stale inspection token"))?;
            Ok(json!({"finished":true}))
        }
        _ => Err(invalid("unsupported inspection operation")),
    }
}
pub(crate) fn begin(
    input: &Value,
    state: &mut State,
    snapshots: Option<&crate::workspace::snapshots::State>,
) -> io::Result<Value> {
    let request: wire::Begin = serde::Deserialize::deserialize(input).map_err(io::Error::other)?;
    if request.memory_only
        && request.files
            .iter()
            .any(|file| file.raw_hash.is_none() || file.snapshot_hash.is_none())
    {
        return Err(invalid("inspection memory-only capture requires caller hashes"));
    }
    let count: usize = state.plans.values().map(Vec::len).sum();
    if state.plans.len() >= MAX_FILES || request.files.len() + count > MAX_FILES {
        return Err(invalid("inspection retained file limit"));
    }
    let retained: usize = state.plans
        .values()
        .flatten()
        .map(|file| file.contents.len())
        .sum();
    let mut files = read::capture(&request, MAX_BYTES - retained, snapshots)?;
    let revision =
        state.revision.checked_add(1).ok_or_else(|| invalid("inspection revision overflow"))?;
    let mut digest = Sha1::new();
    digest.update(revision.to_be_bytes());
    digest.update(serde_json::to_vec(input).map_err(io::Error::other)?);
    let token = crate::validate::hexadecimal(&digest.finalize());
    for (index, file) in files.iter_mut().enumerate() {
        file.snapshot_path = file.snapshot_path.join(format!("{token}-{index}.snapshot"));
    }
    let output = manifest(&token, &files, &request);
    if serde_json::to_vec(&output).map_err(io::Error::other)?.len() > 4 * 1024 * 1024 {
        return Err(invalid("inspection manifest response limit"));
    }
    if !request.memory_only {
        for file in &files {
            file.spool()?;
        }
    }
    state.revision = revision;
    state.plans.insert(token, files);
    Ok(output)
}
fn manifest(token: &str, files: &[read::File], request: &wire::Begin) -> Value {
    let summaries: Vec<_> = files
        .iter()
        .map(|file| {
            let mut summary = file.summary();
            if request.memory_only {
                summary
                    .as_object_mut()
                    .expect("inspection summary object")
                    .remove("snapshotPath");
            }
            summary
        })
        .collect();
    let retained_reads = request.files
        .iter()
        .filter(|file| file.read_token.is_some())
        .count();
    let spooled_files = if request.memory_only { 0 } else { files.len() };
    json!({"token":token,"count":files.len(),"files":summaries,"retainedReads":retained_reads,"spooledFiles":spooled_files})
}

fn invalid(message: &str) -> io::Error {
    io::Error::new(io::ErrorKind::InvalidData, message)
}
fn hash(bytes: &[u8]) -> String {
    crate::validate::hexadecimal(&Sha1::digest(bytes))
}

#[cfg(test)]
mod tests;

#[cfg(test)]
mod diff_tests;

#[cfg(test)]
mod bitmap_tests;

#[cfg(test)]
mod retained_tests;
