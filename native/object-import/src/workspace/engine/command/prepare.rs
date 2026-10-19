mod checkout_import;
mod checkout_lane;
mod checkout_scope;
mod roots;
use super::input::{Operation, Prepare};
use crate::{
    command_import,
    workspace::engine::{client_status::config, invalid, status_context, status_models},
};
use serde_json::{Value, json};
use std::io;

#[cfg(test)]
mod tests;

pub(super) fn context(
    request: &Prepare,
    pool: &rayon::ThreadPool,
) -> io::Result<(Value, Option<command_import::PreparedImport>)> {
    validate(request)?;
    if super::lane_history::phase(&request.options).is_some() {
        return super::lane_history::context::prepare(request, pool);
    }
    if request.operation == Operation::Switch {
        return super::switch::context(request, pool);
    }
    if request.options.lane.is_some() {
        if request.operation != Operation::Merge {
            return Err(invalid("lane checkout unsupported"));
        }
        let (mut context, imported) = super::lane_context::prepare(request, pool)?;
        extend_models(request, pool, &mut context, imported.as_ref())?;
        return Ok((context, imported));
    }
    ordinary_context(request, pool)
}
fn ordinary_context(
    request: &Prepare,
    pool: &rayon::ThreadPool,
) -> io::Result<(Value, Option<command_import::PreparedImport>)> {
    let input = status_context::Request {
        root: request.root.clone(),
        home: request.home.clone(),
        history: false,
    };
    let mut context = checkout_lane::metadata(request, &input, pool)?;
    let mut imported = match request.operation {
        Operation::Checkout => Some(prepare_checkout_import(request, &context)?),
        Operation::Merge | Operation::Switch => {
            Some(command_import::prepare_cached(&request.root, &request.global_remotes_file)?)
        }
    };
    if request.operation == Operation::Checkout && request.options.to.as_deref() == Some("head") {
        imported
            .as_mut()
            .ok_or_else(|| invalid("command import owner"))?
            .sync_unexported(
                &request.global_remotes_file,
                &unexported_targets(request, &context)?,
            )?;
    }
    checkout_lane::attach(request, &mut context, imported.as_mut(), pool)?;
    checkout_scope::attach(request, &mut context, imported.as_mut())?;
    extend_models(request, pool, &mut context, imported.as_ref())?;
    super::checkout_stash::context(request, &mut context)?;
    Ok((context, imported))
}
fn prepare_checkout_import(
    request: &Prepare,
    context: &Value,
) -> io::Result<command_import::PreparedImport> {
    if request.options.stash.is_some() {
        return command_import::prepare_cached(&request.root, &request.global_remotes_file);
    }
    let targets = import_targets(request)?;
    if let Some(imported) = checkout_import::lane(request, context, &targets)? {
        return Ok(imported);
    }
    let local_target = request.options.to
        .as_deref()
        .is_some_and(|to| {
            request.options.revert && to == "main"
                || !matches!(to, "head" | "latest" | "main") && !to.starts_with("head~")
        });
    if local_target {
        let cached = command_import::prepare_cached(&request.root, &request.global_remotes_file)?;
        let default_scope = context["workspace"]["teambit.workspace/workspace"]["defaultScope"]
            .as_str()
            .ok_or_else(|| invalid("command default scope"))?;
        if cached.all_external_targets_unmapped(&targets, default_scope) {
            return Ok(cached);
        }
    }
    command_import::prepare(&request.root, &request.global_remotes_file, &targets)
}
fn unexported_targets(
    request: &Prepare,
    context: &Value,
) -> io::Result<Vec<command_import::Target>> {
    let bitmap = config::document(&request.root.join(".bitmap"))?;
    let rows = bitmap.as_object().ok_or_else(|| invalid("command bitmap"))?;
    Ok(selected(request, context)?
        .iter()
        .filter_map(|target| {
            let identity = target["identity"].as_str()?;
            let (scope, name) = identity.split_once('/')?;
            rows.values()
                .any(|row| {
                    row["scope"] == ""
                        && row["name"] == name
                        && row["rootDir"] == target["directory"]
                })
                .then(|| command_import::Target {
                    scope: Some(scope.to_owned()),
                    name: name.to_owned(),
                    version: "latest".into(),
                })
        })
        .collect())
}
pub(super) fn extend_models(
    request: &Prepare,
    pool: &rayon::ThreadPool,
    context: &mut Value,
    imported: Option<&command_import::PreparedImport>,
) -> io::Result<()> {
    let targets = context["targets"].as_array().ok_or_else(|| invalid("command targets"))?;
    let mut model_targets = targets
        .iter()
        .map(|target| {
            json!({
                "identity":target["identity"],"version":target["version"],
            })
        })
        .collect::<Vec<_>>();
    extend_lane_targets(context, &mut model_targets);
    let models = serde_json::from_value(json!({
        "root":request.root,"history":false,"includeHeads":request.operation != Operation::Switch,
        "targets":model_targets,
    }))
    .map_err(io::Error::other)?;
    let (_, models) = match imported {
        Some(imported) => status_models::read_overlay(&models, pool, &imported.overlay)?,
        None => status_models::read(&models, pool)?,
    };
    context
        .as_object_mut()
        .ok_or_else(|| invalid("command context"))?
        .extend(
            models
                .as_object()
                .ok_or_else(|| invalid("command models"))?
                .clone(),
        );
    Ok(())
}
fn validate(request: &Prepare) -> io::Result<()> {
    if request.operation == Operation::Switch {
        super::switch::validation::options(request)?;
    }
    super::checkout_stash::validate(request)?;
    validate_revert(request)?;
    if request.defer_checkout_pattern
        && (!matches!(request.operation, Operation::Checkout | Operation::Merge)
            || request.options.pattern.is_none())
    {
        return Err(invalid("command deferred checkout selection"));
    }
    for path in [&request.root, &request.home, &request.global_remotes_file] {
        super::super::path(path)?;
    }
    if invalid_lifecycle_options(request)? {
        return Err(invalid("command requires canonical lifecycle"));
    }
    let unmerged = crate::scope_path(&request.root).join("unmerged.json");
    if unmerged.try_exists()? && !config::document(&unmerged)?.as_array().is_some_and(Vec::is_empty)
    {
        return Err(invalid("command unresolved merge state"));
    }
    Ok(())
}

fn invalid_lifecycle_options(request: &Prepare) -> io::Result<bool> {
    let options = &request.options;
    let invalid_strategy = options.strategy
        .as_deref()
        .is_some_and(|value| !matches!(value, "ours" | "theirs" | "manual"));
    let invalid_workspace_only = options.workspace_only
        && (request.operation != Operation::Checkout || options.to.as_deref() != Some("head"));
    let conflicting_forces = options.force_ours && options.force_theirs;
    let interrupted = request.root.join("merge-conflict").try_exists()?;
    Ok(!options.skip_dependency_installation
        || options.scope.include_new_from_scope
            && (request.operation != Operation::Checkout || options.to.as_deref() != Some("head"))
        || !options.scope.include_new_from_scope
            && !options.scope.scope_candidates.is_empty()
        || invalid_workspace_only
        || conflicting_forces && request.operation != Operation::Switch
        || invalid_strategy && request.operation != Operation::Switch
        || interrupted)
}

fn validate_revert(request: &Prepare) -> io::Result<()> {
    if request.options.revert
        && super::lane_history::phase(&request.options).is_none()
        && (request.operation != Operation::Checkout
            || request.options.pattern.is_none()
            || request.options.all
            || !request.options.to
                .as_deref()
                .is_some_and(|to| {
                    to == "main"
                        || (!matches!(to, "head" | "latest" | "reset") && !to.starts_with("head~"))
                }))
    {
        return Err(invalid("command revert requires a selected version"));
    }
    Ok(())
}
fn import_targets(request: &Prepare) -> io::Result<Vec<command_import::Target>> {
    let bitmap = config::document(&request.root.join(".bitmap"))?;
    let targets: Vec<command_import::Target> = bitmap
        .as_object()
        .ok_or_else(|| invalid("command bitmap"))?
        .iter()
        .filter(|(key, _)| !matches!(key.as_str(), "$schema-version" | "_bit_lane"))
        .map(|(_, value)| {
            Ok(command_import::Target {
                scope: value["scope"]
                    .as_str()
                    .filter(|value| !value.is_empty())
                    .map(str::to_owned),
                name: value["name"]
                    .as_str()
                    .ok_or_else(|| invalid("command component name"))?
                    .to_owned(),
                version: value["version"]
                    .as_str()
                    .ok_or_else(|| invalid("command component version"))?
                    .to_owned(),
            })
        })
        .collect::<io::Result<_>>()?;
    Ok(targets)
}

pub(super) fn selected(request: &Prepare, context: &Value) -> io::Result<Vec<Value>> {
    let targets = context["targets"].as_array().ok_or_else(|| invalid("command targets"))?;
    roots::validate(targets)?;
    if super::lane_history::phase(&request.options).is_some() {
        return Ok(targets.clone());
    }
    if let Some(selected) = super::checkout_stash::selected(&request.options, targets)? {
        return Ok(selected);
    }
    if request.operation == Operation::Switch {
        return Ok(targets.clone());
    }
    if request.options.lane.is_some() {
        return lane_selected(context, targets);
    }

    if request.defer_checkout_pattern {
        return Ok(targets.clone());
    }
    if let Some(pattern) = &request.options.pattern {
        return selected_pattern(request, targets, pattern);
    }
    if request.operation == Operation::Checkout
        && !request.options.all
        && !matches!(request.options.to.as_deref(), Some("head" | "latest"))
    {
        return Err(invalid("command checkout requires selection"));
    }
    if request.operation == Operation::Checkout
        && request.options.to.as_deref() == Some("head")
        && !context["lane"]["current"].is_null()
    {
        return selected_checkout_lane_heads(context, targets);
    }
    Ok(targets.clone())
}

fn selected_pattern(request: &Prepare, targets: &[Value], pattern: &str) -> io::Result<Vec<Value>> {
    if request.options.all {
        return Err(invalid("command ambiguous selection"));
    }
    // Canonical multimatch treats ** as all scoped IDs. An explicit pattern
    // also selects fast-forward targets, unlike bare merge's divergent set.
    if (request.operation == Operation::Merge || request.options.revert)
        && pattern == "**"
        && !targets.is_empty()
    {
        return Ok(targets.to_vec());
    }
    select_pattern(targets, pattern)
}

fn selected_checkout_lane_heads(context: &Value, targets: &[Value]) -> io::Result<Vec<Value>> {
    let entries = command_import::lane::entries(&context["lane"]["current"]["value"])?;
    let heads = entries
        .into_iter()
        .filter(|entry| !entry.hidden)
        .map(|entry| entry.identity)
        .collect::<std::collections::HashSet<_>>();
    Ok(targets
        .iter()
        .filter(|target| {
            target["identity"]
                .as_str()
                .is_some_and(|id| heads.contains(id))
        })
        .cloned()
        .collect())
}

fn lane_selected(context: &Value, targets: &[Value]) -> io::Result<Vec<Value>> {
    let selected =
        context["lane"]["targets"].as_array().ok_or_else(|| invalid("command lane selection"))?;
    let mut pool = targets.to_vec();
    if let Some(inactive) = context["lane"]["inactiveTargets"].as_array() {
        pool.extend(inactive.iter().cloned());
    }
    roots::validate(&pool)?;
    Ok(pool
        .into_iter()
        .filter(|target| {
            selected
                .iter()
                .any(|row| row["identity"] == target["identity"])
        })
        .collect())
}

fn select_pattern(targets: &[Value], pattern: &str) -> io::Result<Vec<Value>> {
    let directory = pattern.strip_prefix("./").unwrap_or(pattern);
    if directory
        .split('/')
        .any(|part| matches!(part, "" | "." | ".."))
    {
        return Err(invalid("command complex component pattern"));
    }
    if let Some(target) = targets
        .iter()
        .find(|target| target["directory"] == directory)
    {
        return Ok(vec![target.clone()]);
    }
    let selected = targets
        .iter()
        .filter(|target| matches_identity(target, pattern))
        .cloned()
        .collect::<Vec<_>>();
    if selected.len() != 1 {
        return Err(invalid("command exact selection requires one component"));
    }
    Ok(selected)
}
fn matches_identity(target: &Value, pattern: &str) -> bool {
    target["identity"]
        .as_str()
        .is_some_and(|identity| {
            identity == pattern
                || identity
                    .split_once('/')
                    .is_some_and(|(_, name)| name == pattern)
        })
}

fn extend_lane_targets(context: &Value, model_targets: &mut Vec<Value>) {
    checkout_scope::extend_model_targets(context, model_targets);
    for field in ["inactiveTargets", "addedTargets"] {
        if let Some(rows) = context["lane"][field].as_array() {
            model_targets.extend(
                rows.iter()
                    .map(|row| json!({"identity":row["identity"],"version":row["version"]})),
            );
        }
    }
    let Some(rows) = context["lane"]["targets"].as_array() else { return };
    for row in rows {
        for version in ["head", "currentHead", "mainHead"]
            .into_iter()
            .filter_map(|field| row[field].as_str())
        {
            let target = json!({"identity":row["identity"],"version":version});
            if !model_targets.contains(&target) {
                model_targets.push(target);
            }
        }
    }
}
