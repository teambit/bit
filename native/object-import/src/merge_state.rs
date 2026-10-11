pub(crate) use state::State;
mod lane;
mod reconcile;
mod state;
mod write;

use crate::protocol;
use serde::Deserialize;
use serde_json::{Value, json};
use std::{
    io::{self, Read, Write},
    path::PathBuf,
};

const MAX_JSON: usize = 4 * 1024 * 1024;
#[derive(Deserialize)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
enum Request {
    LaneSnap(lane::Plan),
    ReconcileSnap(reconcile::Plan),
    Initialize { entries: Vec<Value> },
    Transition { token: String, revision: u32, action: state::Action },
    Commit { token: String, revision: u32, path: PathBuf, contents: String },
}
/// A helper owns one bounded pending merge list and verifies each transition token.
pub(crate) fn serve(
    reader: &mut impl Read,
    writer: &mut impl Write,
    state: &mut State,
) -> io::Result<()> {
    let id = protocol::word(reader)?;
    let length = protocol::word(reader)? as usize;
    if length == 0 || length > MAX_JSON {
        return Err(invalid("merge state request budget"));
    }
    let mut bytes = vec![0; length];
    reader.read_exact(&mut bytes)?;
    let result = serde_json::from_slice(&bytes)
        .map_err(io::Error::other)
        .and_then(|request| apply(request, state, &bytes));
    let response = match result {
        Ok(data) => {
            json!({"version":1,"id":id,"completed":1,"skipped":[],"failed":false,"data":data})
        }
        Err(_) => json!({"version":1,"id":id,"completed":0,"skipped":[],"failed":true}),
    };
    protocol::respond(writer, &response)
}
fn apply(request: Request, state: &mut State, bytes: &[u8]) -> io::Result<Value> {
    match request {
        Request::LaneSnap(input) => lane::plan(&input),
        Request::ReconcileSnap(input) => reconcile::plan(&input),
        Request::Initialize { entries } => state.initialize(entries, bytes),
        Request::Transition { token, revision, action } => {
            state.verify(&token, revision)?;
            state.transition(action, bytes)
        }
        Request::Commit { token, revision, path, contents } => {
            state.verify(&token, revision)?;
            state.contents(&contents)?;
            write::commit(&path, &contents)?;
            Ok(json!({"saved":true}))
        }
    }
}
fn invalid(message: &str) -> io::Error {
    io::Error::new(io::ErrorKind::InvalidData, message)
}
fn hash(hash: &str) -> io::Result<()> {
    if hash.len() != 40
        || !hash
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
    {
        return Err(invalid("invalid merge state hash"));
    }
    Ok(())
}
#[cfg(test)]
mod tests;
