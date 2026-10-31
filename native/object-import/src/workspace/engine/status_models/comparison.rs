pub(in crate::workspace::engine) mod capture;

use super::{invalid, semantic, versions};
use rayon::prelude::*;
use serde::Deserialize;
use serde_json::{Value, json};
use std::{collections::HashMap, io, path::PathBuf};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct Request {
    root: PathBuf,
    targets: Vec<Target>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(in crate::workspace::engine) struct Target {
    pub(in crate::workspace::engine) identity: String,
    pub(in crate::workspace::engine) version: String,
    pub(in crate::workspace::engine) directory: String,
    pub(in crate::workspace::engine) files: Vec<String>,
    pub(in crate::workspace::engine) current: Value,
    #[serde(default)]
    pub(in crate::workspace::engine) source_overlays: HashMap<String, PathBuf>,
    #[serde(default)]
    pub(in crate::workspace::engine) source_overlay_root: Option<PathBuf>,
}

/// Own both sides of a full semantic comparison. Source bytes, parsed Version
/// objects and sorting mutations stay in Rust instead of crossing the bridge.
pub(in crate::workspace::engine) fn read(
    request: &Request,
    pool: &rayon::ThreadPool,
) -> io::Result<(usize, Value)> {
    let input = super::Request {
        current_lane_id: None,
        root: request.root.clone(),
        targets: request.targets
            .iter()
            .map(|target| super::Target {
                identity: target.identity.clone(),
                version: target.version.clone(),
            })
            .collect(),
        history: false,
        stage_history: false,
        history_targets_only: false,
        include_heads: false,
    };
    let snapshot = super::load(&input, pool, false)?;
    compare_all(request, &snapshot, pool)
}

fn compare_all(
    request: &Request,
    snapshot: &super::Snapshot,
    pool: &rayon::ThreadPool,
) -> io::Result<(usize, Value)> {
    let models: HashMap<_, _> = snapshot.models
        .iter()
        .map(|model| (model_id(model), model))
        .collect();
    let versions: HashMap<_, _> = snapshot.versions
        .iter()
        .map(|(hash, value)| (hash.as_str(), value))
        .collect();
    let files = capture::all(request, pool)?;
    let comparisons = pool.install(|| {
        request.targets
            .par_iter()
            .zip(files.par_iter())
            .map(|(target, files)| {
                let model = models
                    .get(&target.identity)
                    .ok_or_else(|| invalid("status comparison missing model"))?;
                let reference = versions::reference(model, &target.version)?;
                let version = versions
                    .get(reference.as_str())
                    .ok_or_else(|| invalid("status comparison missing version"))?;
                compare(target, files, version)
            })
            .collect::<io::Result<Vec<_>>>()
    })?;
    Ok((comparisons.len(), json!({"comparisons":comparisons})))
}

pub(in crate::workspace::engine) fn compare(
    target: &Target,
    files: &Value,
    model: &Value,
) -> io::Result<Value> {
    let mut current = target.current.clone();
    current["files"] = files.clone();
    // The canonical consumer assigns the stored log before constructing its
    // pending Version. Logs cannot make a workspace component modified.
    current["log"] = model["log"].clone();
    let result = crate::inspection::compare_owned(
        semantic::project(model)?,
        semantic::project(&current)?,
        target.directory == ".",
    )?;
    Ok(json!({"identity":target.identity,"modified":result["modified"],
        "codeModified":code_modified(files,model)?,
        "modelHash":result["leftHash"],"currentHash":result["rightHash"]}))
}

pub(super) fn model_id(model: &Value) -> String {
    let scope = model["scope"].as_str().unwrap_or_default();
    let name = model["name"].as_str().unwrap_or_default();
    if scope.is_empty() { name.to_owned() } else { format!("{scope}/{name}") }
}

/// `CompFiles.isModified`: empty model files are never code-modified.
fn code_modified(current: &Value, model: &Value) -> io::Result<bool> {
    let model = model["files"].as_array().ok_or_else(|| invalid("status model files"))?;
    let current = current.as_array().ok_or_else(|| invalid("status current files"))?;
    if model.is_empty() {
        return Ok(false);
    }
    Ok(model.len() != current.len()
        || current
            .iter()
            .any(|file| {
                model
                    .iter()
                    .find(|stored| stored["relativePath"] == file["relativePath"])
                    .is_none_or(|stored| stored["file"] != file["file"])
            }))
}
