#[cfg(test)]
mod tests;

use super::{dependency_graph::proof, invalid};
use crate::{mutable_store, store::Store};
use serde::Deserialize;
use serde_json::{Value, json};
use sha1::{Digest, Sha1};
use std::{io, path::PathBuf};

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct Request {
    root: PathBuf,
    plans: Vec<Plan>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Plan {
    identity: String,
    history: Value,
    read_set: Vec<proof::Proof>,
}
pub(super) fn identity(component: &str) -> String {
    let component = component.trim();
    crate::validate::hexadecimal(&Sha1::digest(format!("{component}:VersionHistory").as_bytes()))
}
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
    let mut objects = Vec::new();
    let mut bytes: usize = 0;
    for plan in &request.plans {
        let (hash, serialized) = serialize(plan)?;
        bytes = bytes.saturating_add(serialized.len());
        if bytes > 8 * 1024 * 1024
            || objects
                .iter()
                .any(|(existing, _)| existing == &hash)
        {
            return Err(invalid("status history output limit"));
        }
        objects.push((hash, serialized));
    }
    Ok(objects)
}
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
    let body = serde_json::to_string(&json!({"name":name,"scope":scope,"versions":versions,
        "graphCompleteRefs":history.get("graphCompleteRefs").filter(|value| !value.is_null()).cloned().unwrap_or(json!([]))}))
    .map_err(io::Error::other)?;
    let hash = identity(plan.identity.trim());
    let mut serialized =
        format!("VersionHistory {hash} {}\0", body.encode_utf16().count()).into_bytes();
    serialized.extend_from_slice(body.as_bytes());
    Ok((hash, serialized))
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
    let mut output = json!({"hash":row["hash"],"parents":row["parents"]});
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
