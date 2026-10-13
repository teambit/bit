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
        "inspectionBegin" => begin(&input, state),
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
fn begin(input: &Value, state: &mut State) -> io::Result<Value> {
    let request: wire::Begin = serde::Deserialize::deserialize(input).map_err(io::Error::other)?;
    let count: usize = state.plans.values().map(Vec::len).sum();
    if state.plans.len() >= MAX_FILES || request.files.len() + count > MAX_FILES {
        return Err(invalid("inspection retained file limit"));
    }
    let retained: usize = state.plans
        .values()
        .flatten()
        .map(|file| file.contents.len())
        .sum();
    let mut files = read::capture(&request, MAX_BYTES - retained)?;
    let revision =
        state.revision.checked_add(1).ok_or_else(|| invalid("inspection revision overflow"))?;
    let mut digest = Sha1::new();
    digest.update(revision.to_be_bytes());
    digest.update(serde_json::to_vec(input).map_err(io::Error::other)?);
    let token = crate::validate::hexadecimal(&digest.finalize());
    for (index, file) in files.iter_mut().enumerate() {
        file.snapshot_path = file.snapshot_path.join(format!("{token}-{index}.snapshot"));
    }
    let output = json!({"token":token,"count":files.len(),"files":files.iter().map(read::File::summary).collect::<Vec<_>>()});
    if serde_json::to_vec(&output).map_err(io::Error::other)?.len() > 4 * 1024 * 1024 {
        return Err(invalid("inspection manifest response limit"));
    }
    for file in &files {
        file.spool()?;
    }
    state.revision = revision;
    state.plans.insert(token, files);
    Ok(output)
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
