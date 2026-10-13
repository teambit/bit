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
}

/// Own both sides of a full semantic comparison. Source bytes, parsed Version
/// objects and sorting mutations stay in Rust instead of crossing the bridge.
pub(in crate::workspace::engine) fn read(
    request: &Request,
    pool: &rayon::ThreadPool,
) -> io::Result<(usize, Value)> {
    let input = super::Request {
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
        .map(|model| {
            (
                format!(
                    "{}/{}",
                    model["scope"].as_str().unwrap_or_default(),
                    model["name"].as_str().unwrap_or_default(),
                ),
                model,
            )
        })
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
        "modelHash":result["leftHash"],"currentHash":result["rightHash"]}))
}
