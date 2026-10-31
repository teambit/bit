use super::{Reader, Request, history_population, invalid, lane::Lane, remotes, versions};
use rayon::prelude::*;
use serde_json::{Value, json};
use std::{collections::HashMap, fs::File, io, path::Path};

pub(super) fn read(
    reader: &Reader<'_>,
    models: &[Value],
    request: &Request,
    lane: Option<&Lane>,
    pool: &rayon::ThreadPool,
) -> io::Result<(Vec<Value>, Vec<Value>)> {
    ordinary_merge_state(&request.root)?;
    let proofs = remote_proofs(&request.root, models, lane)?;
    let remotes = remotes::read(&request.root, models)?;
    let targets: HashMap<_, _> = request.targets
        .iter()
        .map(|target| (target.identity.as_str(), target.version.as_str()))
        .collect();
    let results = pool.install(|| {
        models
            .par_iter()
            .map(|model| compare(reader, model, &targets, &remotes, lane, request.stage_history))
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
    lane: Option<&Lane>,
    stage: bool,
) -> io::Result<(Value, Option<Value>)> {
    let identity = model_identity(model, targets)?;
    let remote = remotes.get(&identity).map(String::as_str);
    let head = model
        .get("head")
        .filter(|value| !value.is_null())
        .map(|value| value.as_str().ok_or_else(|| invalid("status model head")))
        .transpose()?;
    if let Some(lane) = lane.filter(|lane| lane.heads.contains_key(&identity)) {
        return compare_lane(reader, model, targets, lane, stage, &identity, [head, remote]);
    }
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

fn model_identity(model: &Value, targets: &HashMap<&str, &str>) -> io::Result<String> {
    model["name"].as_str().ok_or_else(|| invalid("status model name"))?;
    let identity = super::comparison::resolved_model_id(model, targets.keys().copied());
    if !identity.contains('/') {
        return Err(invalid("status model scope"));
    }
    Ok(identity)
}

fn compare_lane(
    reader: &Reader<'_>,
    model: &Value,
    targets: &HashMap<&str, &str>,
    lane: &Lane,
    stage: bool,
    identity: &str,
    main: [Option<&str>; 2],
) -> io::Result<(Value, Option<Value>)> {
    let [head, remote] = main;
    let lane_head = lane.heads.get(identity).ok_or_else(|| invalid("status lane head"))?;
    let merge_remote = lane.own_remotes.get(identity).map(String::as_str);
    let lane_remote = merge_remote
        .or_else(|| lane.remotes.get(identity).map(String::as_str))
        .or(remote)
        .or(head);
    let workspace = targets
        .get(identity)
        .filter(|version| !version.is_empty())
        .map(|version| versions::reference(model, version))
        .transpose()?;
    if workspace
        .as_deref()
        .is_some_and(|version| version != lane_head)
    {
        return Err(invalid("status lane bitmap head mismatch"));
    }
    let (mut result, pending) =
        distances(reader, model, identity, [Some(lane_head), Some(lane_head), lane_remote], stage)?;
    filter_lean_lane_refs(reader, &mut result["status"]["sourceOnly"], lane_head)?;
    if merge_remote.is_none() {
        result["merge"] = json!({"sourceOnly":[],"targetOnly":[],"noCommon":false});
        result["remoteHead"] = Value::Null;
    }
    result["laneHead"] = json!(lane_head);
    result["mainHead"] = json!(head);
    Ok((result, pending))
}

fn filter_lean_lane_refs(
    reader: &Reader<'_>,
    source_only: &mut Value,
    lane_head: &str,
) -> io::Result<()> {
    let Some(refs) = source_only.as_array_mut() else {
        return Ok(());
    };
    let mut kept = Vec::with_capacity(refs.len());
    for entry in std::mem::take(refs) {
        if keep_lane_ref(reader, &entry, lane_head)? {
            kept.push(entry);
        }
    }
    *refs = kept;
    Ok(())
}

fn keep_lane_ref(reader: &Reader<'_>, entry: &Value, lane_head: &str) -> io::Result<bool> {
    let Some(hash) = entry.as_str() else {
        return Ok(false);
    };
    if hash == lane_head {
        return Ok(true);
    }
    let version = match reader.read(hash, "Version") {
        Ok(version) => version,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(false),
        Err(error) => return Err(error),
    };
    Ok(has_lane_origin(&version) || is_locally_mutated(&version))
}

fn has_lane_origin(version: &Value) -> bool {
    version["origin"]["lane"]["scope"]
        .as_str()
        .map(str::trim)
        .is_some_and(|scope| !scope.is_empty())
        && version["origin"]["lane"]["name"]
            .as_str()
            .map(str::trim)
            .is_some_and(|name| !name.is_empty())
}

fn is_locally_mutated(version: &Value) -> bool {
    version
        .get("squashed")
        .is_some_and(|value| !value.is_null() && *value != false)
        || version
            .get("unrelated")
            .is_some_and(|value| !value.is_null() && *value != false)
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
    let file = match File::open(crate::scope_path(root).join("unmerged.json")) {
        Ok(file) => file,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(()),
        Err(error) => return Err(error),
    };
    let bytes = crate::read_budget::Budget::new(1024 * 1024).read(file)?;
    let value: Value = crate::recovery::jsonc::parse(&bytes)?;
    if !value
        .as_array()
        .is_some_and(|rows| {
            rows.len() <= 4096
                && rows
                    .iter()
                    .all(|row| {
                        crate::workspace::engine::command::inbound::remote::file_list::row_scoped_id_parts(
                            row,
                        )
                        .is_some()
                    })
        })
    {
        return Err(invalid("status unresolved merge state requires canonical history"));
    }
    Ok(())
}

fn remote_proofs(root: &Path, models: &[Value], lane: Option<&Lane>) -> io::Result<Vec<Value>> {
    let mut proofs = Vec::new();
    let mut seen = std::collections::HashSet::new();
    let remotes_dir = crate::scope_path(root).join("refs/remotes");
    for model in models {
        if let Some(scope) = model["scope"]
            .as_str()
            .filter(|scope| !scope.is_empty())
            && seen.insert(scope)
        {
            super::super::dependency_graph::proof::read(
                &remotes_dir.join(scope).join("main"),
                &mut proofs,
            )?;
        }
    }
    if let Some(lane) = lane {
        super::super::dependency_graph::proof::read(
            &remotes_dir.join(&lane.scope).join(&lane.name),
            &mut proofs,
        )?;
        if let Some((scope, name)) = lane.forked_from
            .as_deref()
            .and_then(|id| id.split_once('/'))
        {
            super::super::dependency_graph::proof::read(
                &remotes_dir.join(scope).join(name),
                &mut proofs,
            )?;
        }
    }
    proofs
        .into_iter()
        .map(|proof| serde_json::to_value(proof).map_err(io::Error::other))
        .collect()
}
