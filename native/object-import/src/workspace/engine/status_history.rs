//! `VersionHistory` [`identity`], [`proof`] verification, and [`Store`] persistence for [`Request`].

#[cfg(test)]
mod tests;

use super::{dependency_graph::proof, invalid};
use crate::{mutable_store, store::Store};
use serde::Deserialize;
use serde_json::{Value, json};
use sha1::{Digest, Sha1};
use std::{io, path::PathBuf};

/// Wire request for validating or persisting staged `VersionHistory` [`Plan`] entries.
#[derive(Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct Request {
    root: PathBuf,
    plans: Vec<Plan>,
}
/// Single staged `VersionHistory` object update plan with its read-set [`proof::Proof`] entries.
#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Plan {
    identity: String,
    history: Value,
    read_set: Vec<proof::Proof>,
}
/// Computes the SHA-1 object hash for `<component>:VersionHistory`.
#[inline]
pub(super) fn identity(component: &str) -> String {
    let mut hasher = Sha1::new();
    hasher.update(component.trim().as_bytes());
    hasher.update(b":VersionHistory");
    crate::validate::hexadecimal(&hasher.finalize())
}
/// Validates all staged `VersionHistory` plans and read-set proofs in `request`.
#[inline]
pub(super) fn validate(request: &Request) -> io::Result<(usize, Value)> {
    prepare(request)?;
    Ok((request.plans.len(), json!({"fresh":true})))
}
pub(super) fn commit(request: &Request) -> io::Result<(usize, Value)> {
    let objects = prepare(request)?;
    let store = Store::new(crate::scope_path(&request.root).join("objects"), None)?;
    for (hash, bytes) in &objects {
        mutable_store::persist_serialized(&store, hash, bytes, false)?;
    }
    store.finish_batch()?;
    Ok((objects.len(), json!({"written":objects.len()})))
}
fn prepare(request: &Request) -> io::Result<Vec<(String, Vec<u8>)>> {
    super::path(&request.root)?;
    if request.plans.len() > 4096 {
        return Err(invalid("status history plan limit"));
    }
    let proofs: Vec<_> = request.plans
        .iter()
        .flat_map(|plan| plan.read_set.iter().cloned())
        .collect();
    proof::verify(&proofs)?;
    let mut objects = Vec::with_capacity(request.plans.len());
    let mut bytes: usize = 0;
    for plan in &request.plans {
        let (hash, serialized) = serialize(plan)?;
        bytes = bytes
            .checked_add(serialized.len())
            .filter(|total| *total <= 8 * 1024 * 1024)
            .ok_or_else(|| invalid("status history output limit"))?;
        if objects
            .iter()
            .any(|(existing, _)| existing == &hash)
        {
            return Err(invalid("status history output limit"));
        }
        objects.push((hash, serialized));
    }
    Ok(objects)
}
#[inline]
pub(super) fn serialized_plan(value: &Value) -> io::Result<(String, Vec<u8>)> {
    let plan = serde_json::from_value(value.clone()).map_err(io::Error::other)?;
    serialize(&plan)
}

fn serialize(plan: &Plan) -> io::Result<(String, Vec<u8>)> {
    let history = &plan.history;
    let (name, scope) = history_identity(&plan.identity, history)?;
    let versions =
        history["versions"].as_array().ok_or_else(|| invalid("status history versions"))?;
    if versions.len() > 4096 {
        return Err(invalid("status history version count"));
    }
    crate::merge_history::status::distance(&history["versions"], None, None)?;
    let versions: Vec<_> = versions.iter().map(record).collect();
    let complete_refs = complete_refs(history)?;
    let body = serde_json::to_string(&json!({
        "name": name,
        "scope": scope,
        "versions": versions,
        "graphCompleteRefs": complete_refs,
    }))
    .map_err(io::Error::other)?;
    let hash = identity(plan.identity.trim());
    let mut serialized =
        format!("VersionHistory {hash} {}\0", body.encode_utf16().count()).into_bytes();
    serialized.extend_from_slice(body.as_bytes());
    Ok((hash, serialized))
}

fn complete_refs(history: &Value) -> io::Result<Vec<String>> {
    let Some(refs) = history
        .get("graphCompleteRefs")
        .filter(|value| !value.is_null())
    else {
        return Ok(Vec::new());
    };
    let rows = refs.as_array().ok_or_else(|| invalid("status history complete refs"))?;
    if rows.len() > 4096 {
        return Err(invalid("status history complete refs"));
    }
    rows.iter()
        .map(|entry| {
            let text = entry
                .as_str()
                .map(str::trim)
                .ok_or_else(|| invalid("status history complete ref"))?;
            Ok(crate::validate::hexadecimal(&crate::merge_history::hash(text)?))
        })
        .collect()
}

fn history_identity<'a>(
    plan_identity: &'a str,
    history: &'a Value,
) -> io::Result<(&'a str, &'a str)> {
    let name = history["name"]
        .as_str()
        .map(str::trim)
        .filter(|val| !val.is_empty())
        .ok_or_else(|| invalid("status history name"))?;
    let plan_identity = plan_identity.trim();
    let (id_scope, id_name) = plan_identity
        .split_once('/')
        .map_or(("", plan_identity), |(sc, nm)| (sc.trim(), nm.trim()));
    let scope = history["scope"]
        .as_str()
        .map(str::trim)
        .filter(|val| !val.is_empty())
        .unwrap_or(id_scope);
    if name != id_name || (!scope.is_empty() && !id_scope.is_empty() && scope != id_scope) {
        return Err(invalid("status history identity"));
    }
    Ok((name, scope))
}

fn record(row: &Value) -> Value {
    let hash = row["hash"]
        .as_str()
        .map_or_else(|| row["hash"].clone(), |value| json!(value.trim()));
    let parents = row["parents"]
        .as_array()
        .map_or_else(
            || row["parents"].clone(),
            |items| {
                Value::Array(
                    items
                        .iter()
                        .map(|item| {
                            item.as_str()
                                .map_or_else(|| item.clone(), |value| json!(value.trim()))
                        })
                        .collect(),
                )
            },
        );
    let mut output = json!({"hash":hash,"parents":parents});
    for key in ["unrelated", "squashed"] {
        if let Some(value) = row
            .get(key)
            .filter(|value| !value.is_null())
        {
            output[key] = value.clone();
        }
    }
    output
}
