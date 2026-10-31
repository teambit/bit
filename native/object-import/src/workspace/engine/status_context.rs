pub(super) mod configuration;
pub(super) mod tracking;

mod metadata;
#[cfg(test)]
mod tests;

use super::{client_status::config, dependency_graph::proof, invalid, status_models};
use crate::read_budget::Budget;
use rayon::prelude::*;
use serde::Deserialize;
use serde_json::{Value, json};
use std::{collections::HashSet, io, path::PathBuf};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Request {
    pub(super) root: PathBuf,
    pub(super) home: PathBuf,
    #[serde(default = "default_history")]
    pub(super) history: bool,
}

/// Capture current configuration and model metadata without loading Harmony.
/// Unsupported extension providers decline before the caller emits output.
pub(super) fn read(request: &Request, pool: &rayon::ThreadPool) -> io::Result<(usize, Value)> {
    super::path(&request.root)?;
    super::path(&request.home)?;
    let proofs = controls(request)?;
    let mut output = metadata(request, pool)?;
    let settings = config::configuration_value(
        &request.root,
        &configuration::effective(&request.root, &request.home)?,
        true,
    )?;
    let inactive = config::inactive_targets(&request.root, &settings)?;
    exclude_inactive(&mut output, &inactive)?;
    let targets = output["targets"].as_array().ok_or_else(|| invalid("status targets"))?;
    let model_request =
        serde_json::from_value(json!({"root":request.root,"history":request.history,"stageHistory":true,"includeHeads":true,
        "currentLaneId":output["currentLaneId"],
        "targets":targets.iter().map(|target| json!({"identity":target["identity"],
            "version":target["version"]})).collect::<Vec<_>>()}))
        .map_err(io::Error::other)?;
    let (_, models) = status_models::read(&model_request, pool)?;
    let unavailable = unavailable_on_main(&output, &models, &inactive)?;
    output
        .as_object_mut()
        .ok_or_else(|| invalid("status context"))?
        .extend(
            models
                .as_object()
                .ok_or_else(|| invalid("status models"))?
                .clone(),
        );
    output["unavailableOnMain"] = json!(unavailable);
    attach_controls(&mut output, &proofs)?;
    Ok((output["targets"].as_array().map_or(0, Vec::len), output))
}

fn exclude_inactive(output: &mut Value, inactive: &[(String, bool)]) -> io::Result<()> {
    let inactive_ids = inactive
        .iter()
        .map(|(id, _)| id.trim())
        .collect::<HashSet<_>>();
    output["targets"]
        .as_array_mut()
        .ok_or_else(|| invalid("status targets"))?
        .retain(|target| {
            !target["identity"]
                .as_str()
                .map(str::trim)
                .is_some_and(|id| inactive_ids.contains(id))
        });
    Ok(())
}

fn unavailable_on_main(
    context: &Value,
    models: &Value,
    inactive: &[(String, bool)],
) -> io::Result<Vec<String>> {
    if !context["currentLaneId"]
        .as_str()
        .map(str::trim)
        .is_some_and(|id| id.ends_with("/main"))
    {
        return Ok(Vec::new());
    }
    let heads = models["models"]
        .as_array()
        .ok_or_else(|| invalid("status models"))?
        .iter()
        .filter(|model| {
            model["head"]
                .as_str()
                .is_some_and(|head| !head.trim().is_empty())
        })
        .filter_map(|model| {
            let scope = model["scope"]
                .as_str()
                .map(str::trim)
                .filter(|val| !val.is_empty())?;
            let name = model["name"]
                .as_str()
                .map(str::trim)
                .filter(|val| !val.is_empty())?;
            Some(format!("{scope}/{name}"))
        })
        .collect::<HashSet<_>>();
    Ok(inactive
        .iter()
        .filter(|(identity, removed)| !removed && heads.contains(identity.trim()))
        .map(|(identity, _)| identity.trim().to_owned())
        .collect())
}

pub(super) fn metadata(request: &Request, pool: &rayon::ThreadPool) -> io::Result<Value> {
    let settings = config::configuration_value(
        &request.root,
        &configuration::effective(&request.root, &request.home)?,
        true,
    )?;
    let targets = config::context_targets(&request.root, &settings)?;
    metadata_with_targets(request, pool, &settings, targets)
}
pub(super) fn metadata_with_targets(
    request: &Request,
    pool: &rayon::ThreadPool,
    settings: &Value,
    targets: Vec<Value>,
) -> io::Result<Value> {
    metadata_projected(request, pool, settings, targets, false)
}
pub(super) fn metadata_for_recovery(
    request: &Request,
    pool: &rayon::ThreadPool,
    settings: &Value,
    targets: Vec<Value>,
) -> io::Result<Value> {
    metadata_projected(request, pool, settings, targets, true)
}
fn metadata_projected(
    request: &Request,
    pool: &rayon::ThreadPool,
    settings: &Value,
    targets: Vec<Value>,
    recovery: bool,
) -> io::Result<Value> {
    let budget = Budget::new(8 * 1024 * 1024);
    let proofs = component_controls(&request.root, &targets)?;
    let targets = pool.install(|| {
        targets
            .into_par_iter()
            .map(|target| metadata::component(&request.root, target, &budget, recovery))
            .collect::<io::Result<Vec<_>>>()
    })?;
    let mut output = json!({});
    output["options"] = config::options(settings, &super::inventory::patterns::own(&request.root)?);
    output["workspace"] = configuration::effective(&request.root, &request.home)?;
    output["unmerged"] = unmerged(&request.root)?;
    output["scope"] =
        metadata::optional(&crate::scope_path(&request.root).join("scope.json"), &budget)?;
    metadata::scope(&output["scope"])?;
    let bitmap = config::document(&request.root.join(".bitmap"))?;
    output["currentLaneId"] = lane_id(&bitmap, &output["scope"])?;
    output["packageJson"] = metadata::optional(&request.root.join("package.json"), &budget)?;
    output["targets"] = Value::Array(targets);
    output["controlReadSet"] = serde_json::to_value(&proofs).map_err(io::Error::other)?;
    Ok(output)
}

fn component_controls(root: &std::path::Path, targets: &[Value]) -> io::Result<Vec<proof::Proof>> {
    let mut proofs = Vec::new();
    for target in targets {
        let directory = target["directory"]
            .as_str()
            .map(str::trim)
            .filter(|dir| !dir.is_empty())
            .ok_or_else(|| invalid("status control directory"))?;
        for name in ["component.json", "package.json"] {
            proof::read(&root.join(directory).join(name), &mut proofs)?;
        }
    }
    Ok(proofs)
}

fn unmerged(root: &std::path::Path) -> io::Result<Value> {
    let path = crate::scope_path(root).join("unmerged.json");
    if !path.try_exists()? {
        return Ok(json!([]));
    }
    let value = config::document(&path)?;
    if value
        .as_array()
        .is_none_or(|rows| rows.len() > 4096)
    {
        return Err(invalid("status unmerged entries"));
    }
    Ok(value)
}

fn validate_lane_header(header: &Value) -> io::Result<()> {
    let fields = header.as_object().ok_or_else(|| invalid("status lane header"))?;
    if fields
        .keys()
        .any(|key| !matches!(key.as_str(), "id" | "exported"))
        || header
            .get("exported")
            .is_some_and(|value| !value.is_boolean())
    {
        return Err(invalid("status lane header"));
    }
    if let Some(id) = header["id"].as_object()
        && (id.len() != 2 || !id.contains_key("scope") || !id.contains_key("name"))
    {
        return Err(invalid("status lane identity"));
    }
    Ok(())
}

fn lane_id(bitmap: &Value, scope: &Value) -> io::Result<Value> {
    let Some(header) = bitmap.get("_bit_lane") else {
        let name = scope["name"].as_str().ok_or_else(|| invalid("status scope name"))?;
        return Ok(json!(format!("{name}/main")));
    };
    validate_lane_header(header)?;
    let (scope_opt, name) = super::command::inbound::remote::file_list::row_id_parts(header)
        .ok_or_else(|| invalid("status lane identity"))?;
    let lane_scope = scope_opt
        .filter(|text| !text.is_empty())
        .ok_or_else(|| invalid("status lane scope"))?;
    if name.is_empty() || name == "main" {
        return Err(invalid("status lane name"));
    }
    if [lane_scope, name]
        .iter()
        .any(|part| {
            *part == "."
                || *part == ".."
                || !part
                    .bytes()
                    .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'_' | b'-'))
        })
    {
        return Err(invalid("status lane path"));
    }
    Ok(json!(format!("{lane_scope}/{name}")))
}

fn default_history() -> bool {
    true
}

fn controls(request: &Request) -> io::Result<Vec<proof::Proof>> {
    let mut proofs = Vec::new();
    for name in [
        ".bitmap",
        "workspace.jsonc",
        "package.json",
        "merge-conflict",
        ".bit/scope.json",
        ".bit/index.json",
        ".bit/unmerged.json",
    ] {
        let path = name
            .strip_prefix(".bit/")
            .map_or_else(
                || request.root.join(name),
                |name| crate::scope_path(&request.root).join(name),
            );
        proof::read(&path, &mut proofs)?;
    }
    proof::read(&request.home.join(".bitrc.jsonc"), &mut proofs)?;
    Ok(proofs)
}
fn attach_controls(output: &mut Value, proofs: &[proof::Proof]) -> io::Result<()> {
    let controls = serde_json::to_value(proofs).map_err(io::Error::other)?;
    let all =
        output["controlReadSet"].as_array_mut().ok_or_else(|| invalid("status metadata proofs"))?;
    all.extend(
        controls
            .as_array()
            .ok_or_else(|| invalid("status control proofs"))?
            .iter()
            .cloned(),
    );
    let controls = Value::Array(all.clone());
    if let Some(plans) = output["pendingHistory"].as_array_mut() {
        for plan in plans {
            plan["readSet"]
                .as_array_mut()
                .ok_or_else(|| invalid("status history proof"))?
                .extend(
                    controls
                        .as_array()
                        .ok_or_else(|| invalid("status control proof"))?
                        .iter()
                        .cloned(),
                );
        }
    }
    Ok(())
}
