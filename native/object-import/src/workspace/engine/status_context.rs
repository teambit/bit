mod metadata;

use super::{client_status::config, invalid, status_models};
use crate::read_budget::Budget;
use rayon::prelude::*;
use serde::Deserialize;
use serde_json::{Value, json};
use std::{io, path::PathBuf};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Request {
    root: PathBuf,
    home: PathBuf,
}

/// Capture current configuration and model metadata without loading Harmony.
/// Unsupported extension providers decline before the caller emits output.
pub(super) fn read(request: &Request, pool: &rayon::ThreadPool) -> io::Result<(usize, Value)> {
    super::path(&request.root)?;
    super::path(&request.home)?;
    if request.home.join(".bitrc.jsonc").try_exists()?
        || request.root.join(".bitTmp").try_exists()?
        || request.root.join("merge-conflict").try_exists()?
    {
        return Err(invalid("status context requires canonical lifecycle"));
    }
    let settings = config::configuration(&request.root)?;
    let targets = config::context_targets(&request.root, &settings)?;
    let budget = Budget::new(8 * 1024 * 1024);
    let targets = pool.install(|| {
        targets
            .into_par_iter()
            .map(|target| metadata::component(&request.root, target, &budget))
            .collect::<io::Result<Vec<_>>>()
    })?;
    let model_request =
        serde_json::from_value(json!({"root":request.root,"history":true,"includeHeads":true,
        "targets":targets.iter().map(|target| json!({"identity":target["identity"],
            "version":target["version"]})).collect::<Vec<_>>()}))
        .map_err(io::Error::other)?;
    let (_, mut output) = status_models::read(&model_request, pool)?;
    output["options"] =
        config::options(&settings, &super::inventory::patterns::own(&request.root)?);
    output["workspace"] = config::document(&request.root.join("workspace.jsonc"))?;
    output["scope"] = metadata::optional(&request.root.join(".bit/scope.json"), &budget)?;
    metadata::scope(&output["scope"])?;
    output["packageJson"] = metadata::optional(&request.root.join("package.json"), &budget)?;
    let count = targets.len();
    output["targets"] = Value::Array(targets);
    Ok((count, output))
}

#[cfg(test)]
mod tests;
