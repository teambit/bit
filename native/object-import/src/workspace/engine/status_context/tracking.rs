//! Tracking observes projected identities without requiring their bitmap to exist on disk.
use super::{Request as StatusRequest, config, configuration, metadata, status_models};
use crate::{read_budget::Budget, workspace::engine::invalid};
use rayon::prelude::*;
use serde::Deserialize;
use serde_json::{Value, json};
use std::{
    fs, io,
    path::{Path, PathBuf},
};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(in crate::workspace::engine) struct Request {
    root: PathBuf,
    home: PathBuf,
    bitmap: Value,
}

pub(in crate::workspace::engine) fn read(
    request: &Request,
    pool: &rayon::ThreadPool,
) -> io::Result<(usize, Value)> {
    super::super::path(&request.root)?;
    super::super::path(&request.home)?;
    let base =
        StatusRequest { root: request.root.clone(), home: request.home.clone(), history: false };
    let workspace = configuration::effective(&request.root, &request.home)?;
    let settings = config::configuration_value(&request.root, &workspace, true)?;
    let targets = config::context_bitmap_targets(&request.bitmap, &settings)?;
    let mut output = observe(request, &settings, targets, pool)?;
    output["workspace"] = workspace;
    let models = serde_json::from_value(json!({
        "root":request.root,"history":false,"includeHeads":true,
        "currentLaneId":output["currentLaneId"],
        "targets":output["targets"].as_array().ok_or_else(||invalid("tracking targets"))?.iter()
            .map(|target|json!({"identity":target["identity"],"version":target["version"]})).collect::<Vec<_>>(),
    })).map_err(io::Error::other)?;
    let (_, models) = status_models::read(&models, pool)?;
    output
        .as_object_mut()
        .ok_or_else(|| invalid("tracking context"))?
        .extend(
            models
                .as_object()
                .ok_or_else(|| invalid("tracking models"))?
                .clone(),
        );
    super::attach_controls(&mut output, &super::controls(&base)?)?;
    Ok((output["targets"].as_array().map_or(0, Vec::len), output))
}

fn observe(
    request: &Request,
    settings: &Value,
    targets: Vec<Value>,
    pool: &rayon::ThreadPool,
) -> io::Result<Value> {
    let proofs = super::component_controls(&request.root, &targets)?;
    let budget = Budget::new(8 * 1024 * 1024);
    let targets = pool.install(|| {
        targets
            .into_par_iter()
            .map(|target| component(&request.root, target, &budget))
            .collect::<io::Result<Vec<_>>>()
    })?;
    let scope = metadata::optional(&crate::scope_path(&request.root).join("scope.json"), &budget)?;
    metadata::scope(&scope)?;
    Ok(json!({
        "options":config::options(settings,&super::super::inventory::patterns::own(&request.root)?),
        "unmerged":super::unmerged(&request.root)?,"scope":scope,
        "currentLaneId":super::lane_id(&request.bitmap,&scope)?,
        "packageJson":metadata::optional(&request.root.join("package.json"),&budget)?,
        "targets":targets,"controlReadSet":proofs,
    }))
}

fn component(root: &Path, mut target: Value, budget: &Budget) -> io::Result<Value> {
    let path =
        root.join(target["directory"].as_str().ok_or_else(|| invalid("tracking directory"))?);
    let component = optional_jsonc(&path.join("component.json"), budget)?;
    target["config"] =
        if component.is_null() { Value::Null } else { normalize(&component, &target)? };
    target["packageJson"] = metadata::optional(&path.join("package.json"), budget)?;
    Ok(target)
}

fn normalize(value: &Value, target: &Value) -> io::Result<Value> {
    let identity = target["identity"].as_str().ok_or_else(|| invalid("tracking identity"))?;
    let (scope, name) =
        identity.split_once('/').ok_or_else(|| invalid("tracking scoped identity"))?;
    if let Some(id) = value.get("componentId")
        && (id["scope"] != scope || id["name"] != name)
    {
        return Err(invalid("tracking component config identity"));
    }
    let extensions = value
        .get("extensions")
        .cloned()
        .unwrap_or_else(|| json!({}));
    if !extensions.is_object()
        || value
            .get("propagate")
            .is_some_and(|propagate| !propagate.is_boolean())
    {
        return Err(invalid("tracking component configuration"));
    }
    Ok(
        json!({"componentId":{"scope":scope,"name":name},"extensions":extensions,"propagate":value.get("propagate").cloned().unwrap_or(json!(false))}),
    )
}

fn optional_jsonc(path: &Path, budget: &Budget) -> io::Result<Value> {
    let metadata = match fs::symlink_metadata(path) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(Value::Null),
        Err(error) => return Err(error),
    };
    if !metadata.is_file() || metadata.len() > 1024 * 1024 {
        return Err(invalid("tracking metadata size or type"));
    }
    let value = crate::parse_jsonc(&budget.read(fs::File::open(path)?)?)?;
    if !value.is_object() {
        return Err(invalid("tracking metadata object"));
    }
    Ok(value)
}
