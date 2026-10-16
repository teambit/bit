mod capture;
mod files;

use super::{comparison, invalid, versions};
use crate::read_budget::Budget;
use rayon::prelude::*;
use serde::Deserialize;
use serde_json::{Value, json};
use std::{collections::HashMap, io, path::PathBuf};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(in crate::workspace::engine) struct Request {
    #[serde(default)]
    pub(in crate::workspace::engine) import_token: Option<String>,
    root: PathBuf,
    targets: Vec<comparison::Target>,
    git_executable: String,
    color: bool,
    #[serde(default)]
    modified_only: bool,
}

pub(in crate::workspace::engine) fn read(
    request: &Request,
    pool: &rayon::ThreadPool,
) -> io::Result<(usize, Value)> {
    read_overlay(request, pool, None)
}

pub(in crate::workspace::engine) fn read_overlay(
    request: &Request,
    pool: &rayon::ThreadPool,
    overlay: Option<&crate::command_import::Overlay>,
) -> io::Result<(usize, Value)> {
    let input = model_request(request);
    let snapshot = super::load_overlay(&input, pool, false, overlay)?;
    let captured = capture::all(request, pool)?;
    let budgets = source_budgets(&captured)?;
    let models = index_models(&snapshot.models);
    let versions = index_versions(&snapshot.versions);
    let comparisons = pool.install(|| {
        request.targets
            .par_iter()
            .zip(captured.into_par_iter())
            .map(|(target, sources)| {
                let model = selected(target, &models, &versions)?;
                one(request, target, sources, model, &budgets, overlay)
            })
            .collect::<io::Result<Vec<_>>>()
    })?;
    Ok((comparisons.len(), json!({"comparisons":comparisons})))
}

struct Budgets {
    raw: Budget,
    packed: Budget,
    output: Budget,
}
fn source_budgets(captured: &[Vec<capture::File>]) -> io::Result<Budgets> {
    let used = captured
        .iter()
        .flatten()
        .map(|file| file.cost)
        .sum::<usize>();
    let raw = Budget::new(
        super::super::MAX_RAW
            .checked_sub(used)
            .ok_or_else(|| invalid("workspace diff normalized source budget"))?,
    );
    let packed = Budget::new(super::super::MAX_RAW);
    Ok(Budgets { raw, packed, output: Budget::new(super::super::MAX_OUTPUT) })
}

fn index_versions(versions: &[(String, Value)]) -> HashMap<&str, &Value> {
    versions
        .iter()
        .map(|(reference, value)| (reference.as_str(), value))
        .collect()
}

fn model_request(request: &Request) -> super::Request {
    super::Request {
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
        include_heads: false,
    }
}

fn index_models(models: &[Value]) -> HashMap<String, &Value> {
    models
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
        .collect()
}

fn selected<'a>(
    target: &comparison::Target,
    models: &HashMap<String, &Value>,
    versions: &HashMap<&str, &'a Value>,
) -> io::Result<Option<&'a Value>> {
    let model = models.get(&target.identity);
    if target.version.is_empty() {
        return if model.is_none() {
            Ok(None)
        } else {
            Err(invalid("workspace diff bitmap normalization"))
        };
    }
    let model = model.ok_or_else(|| invalid("workspace diff missing model"))?;
    let reference = versions::reference(model, &target.version)?;
    versions
        .get(reference.as_str())
        .copied()
        .map(Some)
        .ok_or_else(|| invalid("workspace diff missing version"))
}

fn one(
    request: &Request,
    target: &comparison::Target,
    sources: Vec<capture::File>,
    model: Option<&Value>,
    budgets: &Budgets,
    overlay: Option<&crate::command_import::Overlay>,
) -> io::Result<Value> {
    let metadata = Value::Array(
        sources
            .iter()
            .map(|file| file.metadata.clone())
            .collect(),
    );
    let modified = match model {
        Some(model) => comparison::compare(target, &metadata, model)?["modified"].clone(),
        None => json!(true),
    };
    let mut current = target.current.clone();
    current["files"] = metadata;
    let files = if request.modified_only && modified == false {
        Vec::new()
    } else {
        files::read(request, sources, model, budgets, overlay)?
    };
    Ok(
        json!({"identity":target.identity,"modified":modified,"model":model,"current":current,"files":files}),
    )
}
