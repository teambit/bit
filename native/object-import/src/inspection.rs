pub(crate) use bitmap::{
    component_row, normalize as normalize_bitmap, render as render_bitmap,
    render_workspace as render_workspace_bitmap,
};
pub(crate) use compare::modified as compare_owned;
pub(crate) use modified::modified;

mod bitmap;
#[cfg(test)]
mod bitmap_tests;
mod compare;
mod diff;
#[cfg(test)]
mod diff_tests;
mod files;
mod modified;
mod read;
#[cfg(test)]
mod retained_tests;
mod snapshot;
#[cfg(test)]
mod snapshot_tests;
#[cfg(test)]
mod tests;
mod wire;

use serde_json::{Value, json};
use sha1::{Digest, Sha1};
use std::{
    collections::HashMap,
    io,
    sync::{Arc, Weak},
};
type Plans = HashMap<String, Arc<[read::File]>>;

const MAX_FILES: usize = 4096;
const MAX_BYTES: usize = 32 * 1024 * 1024;
#[derive(Default)]
pub(crate) struct State {
    plans: Plans,
    revision: u64,
    memory_snapshots: bool,
    retained: Vec<Weak<[read::File]>>,
}
pub(crate) fn apply(kind: &str, input: Value, state: &mut State) -> io::Result<Value> {
    match kind.trim() {
        "inspectionBegin" => begin(&input, state, None),
        "inspectionDiff" => diff::plan(input, &state.plans),
        "inspectionCompare" => compare::plan(input),
        "inspectionFiles" => files::plan(input, &state.plans),
        "inspectionFinish" => {
            let request: wire::Token = serde_json::from_value(input).map_err(io::Error::other)?;
            state.plans
                .remove(request.token.trim())
                .ok_or_else(|| invalid("stale inspection token"))?;
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
    snapshot::validate_mode(&request, state)?;
    let maximum = snapshot::remaining(state, request.files.len())?;
    let mut files = read::capture(&request, maximum, snapshots)?;
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
    if !request.memory_only && !request.owned_memory {
        for file in &files {
            file.spool()?;
        }
    }
    state.revision = revision;
    let files: Arc<[read::File]> = files.into();
    state.retained.push(Arc::downgrade(&files));
    state.plans.insert(token, files);
    Ok(output)
}
fn manifest(token: &str, files: &[read::File], request: &wire::Begin) -> Value {
    let summaries: Vec<_> = files
        .iter()
        .map(|file| {
            let mut summary = file.summary();
            if (request.memory_only || request.owned_memory)
                && let Some(object) = summary.as_object_mut()
            {
                object.remove("snapshotPath");
            }
            summary
        })
        .collect();
    let retained_reads = request.files
        .iter()
        .filter(|file| file.read_token.is_some())
        .count();
    let spooled_files = if request.memory_only || request.owned_memory { 0 } else { files.len() };
    json!({"token":token,"count":files.len(),"files":summaries,"retainedReads":retained_reads,"spooledFiles":spooled_files})
}

fn invalid(message: &str) -> io::Error {
    io::Error::new(io::ErrorKind::InvalidData, message)
}
fn hash(bytes: &[u8]) -> String {
    crate::validate::hexadecimal(&Sha1::digest(bytes))
}
