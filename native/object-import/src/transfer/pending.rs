//! Pending object-directory materialization ([`write`], [`Request`], [`Owner`], [`State`], `transferWritePending`) from frozen transfer plans.

use serde::Deserialize;
use serde_json::{Value, json};
use std::{collections::HashMap, io, path::PathBuf};

use super::{State, invalid};

/// Deserialized `transferWritePending` request (`token`, `pendingDir`, optional `chown` ([`Owner`])) consumed by [`write`].
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Request {
    token: String,
    pending_dir: PathBuf,
    #[serde(alias = "owner")]
    chown: Option<Owner>,
}

/// POSIX `(uid, gid)` ownership pair applied when writing objects into a pending directory.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(deny_unknown_fields)]
struct Owner {
    uid: u32,
    gid: u32,
}

/// Materializes all objects from a frozen transfer plan in `state` ([`State`]) into `pendingDir` ([`Request`]) with optional [`Owner`] preservation.
pub(super) fn write(state: &State, input: &Value) -> io::Result<Value> {
    let request: Request = serde::Deserialize::deserialize(input).map_err(io::Error::other)?;
    crate::transfer::paths(&request.pending_dir, &request.pending_dir.join(".native-path-check"))?;
    let token = request.token.trim();
    if token.is_empty() || token.len() > 256 || token.contains(char::is_control) {
        return Err(invalid("unknown pending transfer token"));
    }
    let plan = state.plans.get(token).ok_or_else(|| invalid("unknown pending transfer token"))?;
    let mut hashes = HashMap::with_capacity(plan.entries.len());
    for entry in &plan.entries {
        let body = entry.compressed.as_ref();
        if *hashes.entry(entry.hash).or_insert(body) != body {
            return Err(invalid("conflicting scoped object bytes in pending directory"));
        }
    }
    let owner = request.chown.map(|owner| (owner.uid, owner.gid));
    let store = crate::store::Store::new(request.pending_dir, owner)?;
    let mut completed: usize = 0;
    for entry in &plan.entries {
        if store
            .write(&crate::validate::hexadecimal(&entry.hash), &entry.compressed)
            .is_err()
        {
            break;
        }
        completed = completed.saturating_add(1);
    }
    Ok(
        json!({"completed":completed,"count":plan.entries.len(),"failed":completed != plan.entries.len()}),
    )
}
