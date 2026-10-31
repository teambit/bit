use serde::Deserialize;
use serde_json::{Value, json};
use std::{collections::HashMap, io, path::PathBuf};

use super::{State, invalid};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Request {
    token: String,
    pending_dir: PathBuf,
    #[serde(alias = "owner")]
    chown: Option<Owner>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Owner {
    uid: u32,
    gid: u32,
}

pub(super) fn write(state: &State, input: &Value) -> io::Result<Value> {
    let request: Request = serde::Deserialize::deserialize(input).map_err(io::Error::other)?;
    crate::transfer::paths(&request.pending_dir, &request.pending_dir.join(".native-path-check"))?;
    let plan = state.plans
        .get(request.token.trim())
        .ok_or_else(|| invalid("unknown pending transfer token"))?;
    let mut hashes = HashMap::new();
    for entry in &plan.entries {
        if hashes
            .insert(entry.hash, &entry.compressed)
            .is_some_and(|body| body != &entry.compressed)
        {
            return Err(invalid("conflicting scoped object bytes in pending directory"));
        }
    }
    let owner = request.chown.map(|owner| (owner.uid, owner.gid));
    let store = crate::store::Store::new(request.pending_dir, owner)?;
    let mut completed = 0;
    for entry in &plan.entries {
        if store
            .write(&crate::validate::hexadecimal(&entry.hash), &entry.compressed)
            .is_err()
        {
            break;
        }
        completed += 1;
    }
    Ok(
        json!({"completed":completed,"count":plan.entries.len(),"failed":completed != plan.entries.len()}),
    )
}
