//! Compare two validated local Version objects without visiting workspace files.

use super::{Request as ModelsRequest, Target, invalid, load, versions};
use crate::{
    checkout::repository,
    read_budget::Budget,
    workspace::engine::{MAX_OUTPUT, MAX_RAW, diff},
};
use rayon::ThreadPool;
use serde::Deserialize;
use serde_json::{Value, json};
use std::{
    collections::{HashMap, HashSet},
    io,
    path::PathBuf,
};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(in crate::workspace::engine) struct Request {
    root: PathBuf,
    identity: String,
    from_version: String,
    to_version: String,
    git_executable: String,
    color: bool,
}

pub(in crate::workspace::engine) fn read(
    request: &Request,
    pool: &ThreadPool,
) -> io::Result<(usize, Value)> {
    let (from, to) = load_pair(request, pool)?;
    let files = compare_files(request, pool, &from, &to)?;
    Ok((
        1,
        json!({"identity":request.identity,"model":from,"current":to,"files":files,"modified":true}),
    ))
}

fn load_pair(request: &Request, pool: &ThreadPool) -> io::Result<(Value, Value)> {
    let snapshot = load(
        &ModelsRequest {
            root: request.root.clone(),
            targets: [request.from_version.as_str(), request.to_version.as_str()]
                .into_iter()
                .map(|version| Target {
                    identity: request.identity.clone(),
                    version: version.to_string(),
                })
                .collect(),
            history: false,
            include_heads: false,
            stage_history: false,
            current_lane_id: None,
        },
        pool,
        false,
    )?;
    let (scope, name) =
        request.identity.split_once('/').ok_or_else(|| invalid("version diff identity"))?;
    let model = snapshot.models
        .iter()
        .find(|model| model["scope"] == scope && model["name"] == name)
        .ok_or_else(|| invalid("version diff model absent"))?;
    let reference = |version| versions::reference(model, version);
    let from_ref = reference(&request.from_version)?;
    let to_ref = reference(&request.to_version)?;
    let index: HashMap<&str, &Value> = snapshot.versions
        .iter()
        .map(|(reference, value)| (reference.as_str(), value))
        .collect();
    let from = index.get(from_ref.as_str()).ok_or_else(|| invalid("version diff from absent"))?;
    let to = index.get(to_ref.as_str()).ok_or_else(|| invalid("version diff to absent"))?;
    Ok(((*from).clone(), (*to).clone()))
}

fn compare_files(
    request: &Request,
    pool: &ThreadPool,
    from: &Value,
    to: &Value,
) -> io::Result<Vec<Value>> {
    let raw = Budget::new(MAX_RAW);
    let packed = Budget::new(MAX_RAW);
    let left = sources(&request.root, from, &raw, &packed)?;
    let right = sources(&request.root, to, &raw, &packed)?;
    let files = join_sources(left, right);
    let output = Budget::new(MAX_OUTPUT);
    pool.install(|| diff::frozen(files, &request.git_executable, request.color))?
        .into_iter()
        .map(|file| {
            let file = file.without_contents();
            output.reserve(
                file["rawDiff"]
                    .as_str()
                    .ok_or_else(|| invalid("version diff patch"))?
                    .len(),
            )?;
            Ok(file)
        })
        .collect()
}

fn join_sources(left: Vec<(String, Vec<u8>)>, right: Vec<(String, Vec<u8>)>) -> Vec<diff::Frozen> {
    let right_order: Vec<String> = right
        .iter()
        .map(|(path, _)| path.clone())
        .collect();
    let mut right = right.into_iter().collect::<HashMap<_, _>>();
    let mut files = Vec::new();
    for (path, body) in left {
        files.push((path.clone(), Some(body), right.remove(&path)));
    }
    for path in right_order {
        if let Some(body) = right.remove(&path) {
            files.push((path, None, Some(body)));
        }
    }
    files
}

fn sources(
    root: &std::path::Path,
    version: &Value,
    raw: &Budget,
    packed: &Budget,
) -> io::Result<Vec<(String, Vec<u8>)>> {
    let files = version["files"].as_array().ok_or_else(|| invalid("version diff files"))?;
    if files.len() > 4096 {
        return Err(invalid("version diff file limit"));
    }
    let mut seen = HashSet::new();
    files
        .iter()
        .map(|file| {
            let path = file["relativePath"].as_str().ok_or_else(|| invalid("version diff path"))?;
            if path.len() > 32768 || path.contains('\0') || !seen.insert(path) {
                return Err(invalid("version diff duplicate or invalid path"));
            }
            let reference =
                file["file"].as_str().ok_or_else(|| invalid("version diff source ref"))?;
            let reference = crate::merge_history::hash(reference)?;
            let source =
                repository::read_source_shared(&root.join(".bit/objects"), reference, raw, packed)?;
            crate::merge_transaction::reads::source(reference, &source)?;
            Ok((path.to_string(), source.body))
        })
        .collect()
}
