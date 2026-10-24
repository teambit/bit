//! Component status populates existing history before deciding what to stash.
use super::{Retained, invalid};
use crate::workspace::engine::{dependency_graph::proof, status_history, status_models};
use serde_json::{Value, json};
use std::{
    collections::HashMap,
    fs::File,
    io::{self, Read},
};

fn plans(
    retained: &Retained,
    selected: Option<&[String]>,
    pool: &rayon::ThreadPool,
) -> io::Result<Vec<Value>> {
    let targets = targets(&retained.context, selected)?;
    let request = serde_json::from_value(json!({
        "root":retained.root,"targets":targets,"history":true,"stageHistory":true,
        "includeHeads":true,"historyTargetsOnly":true,"currentLaneId":retained.context["currentLaneId"],
    }))
    .map_err(io::Error::other)?;
    let (_, result) = status_models::read(&request, pool)?;
    let plans = result
        .get("pendingHistory")
        .map_or(Ok(&[][..]), |plans| {
            plans
                .as_array()
                .map(Vec::as_slice)
                .ok_or_else(|| invalid("stash history plans"))
        })?;
    Ok(plans.to_vec())
}

pub(super) fn prepare(
    retained: &mut Retained,
    selected: Option<&[String]>,
    pool: &rayon::ThreadPool,
) -> io::Result<usize> {
    if retained.graph.history_plans.is_some() {
        return Err(invalid("stash history already prepared"));
    }
    let plans = plans(retained, selected, pool)?;
    let count = plans.len();
    retained.graph.history_plans = Some(plans);
    Ok(count)
}

pub(super) fn commit(
    retained: &mut Retained,
    selected: Option<&[String]>,
    pool: &rayon::ThreadPool,
) -> io::Result<usize> {
    let plans = match &retained.graph.history_plans {
        Some(plans) => plans.clone(),
        None => plans(retained, selected, pool)?,
    };
    let request = serde_json::from_value(json!({"root":retained.root,"plans":plans}))
        .map_err(io::Error::other)?;
    status_history::commit(&request)?;
    accept(retained, &plans)?;
    retained.graph.history_plans = None;
    Ok(plans.len())
}

fn targets(context: &Value, selected: Option<&[String]>) -> io::Result<Vec<Value>> {
    let targets = context["targets"].as_array().ok_or_else(|| invalid("stash history targets"))?;
    Ok(targets
        .iter()
        .filter(|target| selected.is_none_or(|ids| contains(ids, target)))
        .map(|target| json!({"identity":target["identity"],"version":target["version"]}))
        .collect())
}

fn contains(ids: &[String], target: &Value) -> bool {
    target["identity"]
        .as_str()
        .is_some_and(|identity| ids.iter().any(|id| id == identity))
}

fn accept(retained: &mut Retained, plans: &[Value]) -> io::Result<()> {
    let mut files = HashMap::new();
    let budget = crate::read_budget::Budget::new(16 * 1024 * 1024);
    let inflated = crate::read_budget::Budget::new(8 * 1024 * 1024);
    for plan in plans {
        let (reference, expected) = status_history::serialized_plan(plan)?;
        let path = crate::scope_path(&retained.root)
            .join("objects")
            .join(&reference[..2])
            .join(&reference[2..]);
        let packed = budget.read(File::open(&path)?)?;
        verify_published(&expected, &packed, &inflated)?;
        files.insert(path, packed);
    }
    proof::accept_published(&mut retained.proofs, &files);
    retained.proofs.extend(files.iter().map(|(path, bytes)| proof::content(path, bytes)));
    proof::verify(&retained.proofs)?;
    retained.repository.accept_published(&files)
}

fn verify_published(
    expected: &[u8],
    packed: &[u8],
    budget: &crate::read_budget::Budget,
) -> io::Result<()> {
    budget.reserve(expected.len() + 1)?;
    let mut actual = Vec::new();
    flate2::read::ZlibDecoder::new(packed)
        .take(u64::try_from(expected.len()).map_err(io::Error::other)? + 1)
        .read_to_end(&mut actual)?;
    if actual != expected {
        return Err(invalid("stash history changed after publication"));
    }
    Ok(())
}

#[cfg(test)]
mod tests;
