use super::{Reader, Request, history_population, invalid, remotes, versions};
use rayon::prelude::*;
use serde_json::{Value, json};
use std::{collections::HashMap, fs::File, io, path::Path};

pub(super) fn read(
    reader: &Reader<'_>,
    models: &[Value],
    request: &Request,
    pool: &rayon::ThreadPool,
) -> io::Result<(Vec<Value>, Vec<Value>)> {
    ordinary_merge_state(&request.root)?;
    let proofs = remote_proofs(&request.root, models)?;
    let remotes = remotes::read(&request.root, models)?;
    let targets: HashMap<_, _> = request.targets
        .iter()
        .map(|target| (target.identity.as_str(), target.version.as_str()))
        .collect();
    let results = pool.install(|| {
        models
            .par_iter()
            .map(|model| compare(reader, model, &targets, &remotes, request.stage_history))
            .collect::<io::Result<Vec<_>>>()
    })?;
    let (histories, pending): (Vec<_>, Vec<_>) = results.into_iter().unzip();
    let pending = pending
        .into_iter()
        .flatten()
        .map(|mut plan| {
            let rows =
                plan["readSet"].as_array_mut().ok_or_else(|| invalid("status history proofs"))?;
            rows.extend(proofs.clone());
            Ok(plan)
        })
        .collect::<io::Result<Vec<_>>>()?;
    Ok((histories, pending))
}
fn compare(
    reader: &Reader<'_>,
    model: &Value,
    targets: &HashMap<&str, &str>,
    remotes: &HashMap<String, String>,
    stage: bool,
) -> io::Result<(Value, Option<Value>)> {
    let identity = format!(
        "{}/{}",
        model["scope"].as_str().ok_or_else(|| invalid("status model scope"))?,
        model["name"].as_str().ok_or_else(|| invalid("status model name"))?,
    );
    let remote = remotes.get(&identity).map(String::as_str);
    let head = model
        .get("head")
        .filter(|value| !value.is_null())
        .map(|value| value.as_str().ok_or_else(|| invalid("status model head")))
        .transpose()?;
    let workspace = targets
        .get(identity.as_str())
        .filter(|version| !version.is_empty())
        .map(|version| versions::reference(model, version))
        .transpose()?;
    // The canonical no-remote branch traverses the model head, even when
    // a detached workspace version was passed as the source head.
    let source = if remote.is_some() { workspace.as_deref().or(head) } else { head };
    distances(reader, model, &identity, [source, head, remote], stage)
}

fn distances(
    reader: &Reader<'_>,
    model: &Value,
    identity: &str,
    heads: [Option<&str>; 3],
    stage: bool,
) -> io::Result<(Value, Option<Value>)> {
    let [source, head, remote] = heads;
    let (records, pending) = if source == remote && head == remote {
        (json!([]), None)
    } else {
        history_population::prepare(reader, model, identity, &[source, remote, head], stage)?
    };
    if pending.is_some() && remote.is_some() && source != head {
        return Err(invalid("detached history population requires canonical ordering"));
    }
    let distance = |from| {
        if from == remote {
            Ok(json!({"sourceOnly":[],"targetOnly":[],"noCommon":false}))
        } else {
            crate::merge_history::status::distance(&records, from, remote)
        }
    };
    Ok((
        json!({"identity":identity,"remoteHead":remote,"status":distance(source)?,"merge":distance(head)?}),
        pending,
    ))
}

fn ordinary_merge_state(root: &Path) -> io::Result<()> {
    let file = match File::open(root.join(".bit/unmerged.json")) {
        Ok(file) => file,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(()),
        Err(error) => return Err(error),
    };
    let bytes = crate::read_budget::Budget::new(1024 * 1024).read(file)?;
    let value: Value = serde_json::from_slice(&bytes).map_err(io::Error::other)?;
    if !value.as_array().is_some_and(Vec::is_empty) {
        return Err(invalid("status unresolved merge state requires canonical history"));
    }
    Ok(())
}

fn remote_proofs(root: &Path, models: &[Value]) -> io::Result<Vec<Value>> {
    let mut proofs = Vec::new();
    let mut seen = std::collections::HashSet::new();
    for model in models {
        let scope = model["scope"].as_str().ok_or_else(|| invalid("status history scope"))?;
        if seen.insert(scope) {
            super::super::dependency_graph::proof::read(
                &root
                    .join(".bit/refs/remotes")
                    .join(scope)
                    .join("main"),
                &mut proofs,
            )?;
        }
    }
    proofs
        .into_iter()
        .map(|proof| serde_json::to_value(proof).map_err(io::Error::other))
        .collect()
}
