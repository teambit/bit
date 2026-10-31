//! Compare two validated local Version objects without visiting workspace files.

use super::{Request as ModelsRequest, Target, invalid, load_overlay, versions};
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
    #[serde(default)]
    pub(in crate::workspace::engine) import_token: Option<String>,
    root: PathBuf,
    identity: String,
    from_version: String,
    to_version: String,
    git_executable: String,
    color: bool,
    #[serde(default)]
    no_parent: bool,
}

pub(in crate::workspace::engine) fn read(
    request: &Request,
    pool: &ThreadPool,
) -> io::Result<(usize, Value)> {
    read_overlay(request, pool, None)
}

pub(in crate::workspace::engine) fn read_overlay(
    request: &Request,
    pool: &rayon::ThreadPool,
    overlay: Option<&crate::command_import::Overlay>,
) -> io::Result<(usize, Value)> {
    let (from, to) = load_pair(request, pool, overlay)?;
    let files = compare_files(request, pool, &from, &to, overlay)?;
    Ok((
        1,
        json!({"identity":request.identity,"model":if request.no_parent { Value::Null } else { from },"current":to,"files":files,"modified":true}),
    ))
}

fn load_pair(
    request: &Request,
    pool: &ThreadPool,
    overlay: Option<&crate::command_import::Overlay>,
) -> io::Result<(Value, Value)> {
    let snapshot = load_overlay(
        &ModelsRequest {
            root: request.root.clone(),
            targets: target_versions(request),
            history: false,
            include_heads: false,
            stage_history: false,
            history_targets_only: false,
            current_lane_id: None,
        },
        pool,
        false,
        overlay,
    )?;
    let model = snapshot.models
        .iter()
        .find(|model| super::comparison::model_matches_identity(model, &request.identity))
        .ok_or_else(|| invalid("version diff model absent"))?;
    let reference = |version| versions::reference(model, version);
    let to_ref = reference(&request.to_version)?;
    let index: HashMap<&str, &Value> = snapshot.versions
        .iter()
        .map(|(reference, value)| (reference.as_str(), value))
        .collect();
    let to = index.get(to_ref.as_str()).ok_or_else(|| invalid("version diff to absent"))?;
    let from = if request.no_parent {
        json!({"files":[]})
    } else {
        let from_ref = reference(&request.from_version)?;
        (*index.get(from_ref.as_str()).ok_or_else(|| invalid("version diff from absent"))?).clone()
    };
    Ok((from, (*to).clone()))
}

fn target_versions(request: &Request) -> Vec<Target> {
    let identity = request.identity.trim();
    let to_version = request.to_version.trim();
    [request.from_version.trim(), to_version]
        .into_iter()
        .filter(|version| !request.no_parent || *version == to_version)
        .map(|version| Target { identity: identity.to_string(), version: version.to_string() })
        .collect()
}

fn compare_files(
    request: &Request,
    pool: &ThreadPool,
    from: &Value,
    to: &Value,
    overlay: Option<&crate::command_import::Overlay>,
) -> io::Result<Vec<Value>> {
    let raw = Budget::new(MAX_RAW);
    let packed = Budget::new(MAX_RAW);
    let left = sources(&request.root, from, &raw, &packed, overlay)?;
    let right = sources(&request.root, to, &raw, &packed, overlay)?;
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
    overlay: Option<&crate::command_import::Overlay>,
) -> io::Result<Vec<(String, Vec<u8>)>> {
    let files = version["files"].as_array().ok_or_else(|| invalid("version diff files"))?;
    if files.len() > 4096 {
        return Err(invalid("version diff file limit"));
    }
    let mut seen = HashSet::new();
    files
        .iter()
        .map(|file| {
            let path = file["relativePath"]
                .as_str()
                .map(str::trim)
                .ok_or_else(|| invalid("version diff path"))?;
            if path.is_empty() || path.len() > 32768 || path.contains('\0') || !seen.insert(path) {
                return Err(invalid("version diff duplicate or invalid path"));
            }
            let reference = file["file"]
                .as_str()
                .map(str::trim)
                .filter(|reference| !reference.is_empty())
                .ok_or_else(|| invalid("version diff source ref"))?;
            if let Some(source) = overlay.and_then(|overlay| overlay.source(reference)) {
                raw.reserve(source.len())?;
                overlay.expect("source belongs to overlay").trace_source(reference)?;
                return Ok((path.to_string(), source.to_vec()));
            }
            let reference = crate::merge_history::hash(reference)?;
            let source = repository::read_source_shared(
                &crate::scope_path(root).join("objects"),
                reference,
                raw,
                packed,
            )?;
            crate::merge_transaction::reads::source(reference, &source)?;
            Ok((path.to_string(), source.body))
        })
        .collect()
}
