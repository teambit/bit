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
    let input = status_context::Request {
        root: request.root.clone(),
        home: request.home.clone(),
        history: false,
    };
    let mut context = status_context::metadata(&input, pool)?;
    let mut imported = match request.operation {
        Operation::Checkout => Some(command_import::prepare(
            &request.root,
            &request.global_remotes_file,
            &import_targets(request)?,
        )?),
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
    extend_models(request, pool, &mut context, imported.as_ref())?;
    Ok((context, imported))
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
    for path in [&request.root, &request.home, &request.global_remotes_file] {
        super::super::path(path)?;
    }
    let contradictory_forces = request.options.force_ours && request.options.force_theirs;
    if !request.options.skip_dependency_installation
        || contradictory_forces
        || request.options.strategy
            .as_deref()
            .is_some_and(|value| !matches!(value, "ours" | "theirs" | "manual"))
        || request.home.join(".bitrc.jsonc").try_exists()?
        || request.root.join(".bitTmp").try_exists()?
        || request.root.join("merge-conflict").try_exists()?
    {
        return Err(invalid("command requires canonical lifecycle"));
    }
    let unmerged = request.root.join(".bit/unmerged.json");
    if unmerged.try_exists()? && !config::document(&unmerged)?.as_array().is_some_and(Vec::is_empty)
    {
        return Err(invalid("command unresolved merge state"));
    }
    Ok(())
}
fn import_targets(request: &Prepare) -> io::Result<Vec<command_import::Target>> {
    let bitmap = config::document(&request.root.join(".bitmap"))?;
    bitmap
        .as_object()
        .ok_or_else(|| invalid("command bitmap"))?
        .iter()
        .filter(|(key, _)| key.as_str() != "$schema-version")
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
        .collect()
}

pub(super) fn selected(request: &Prepare, context: &Value) -> io::Result<Vec<Value>> {
    let targets = context["targets"].as_array().ok_or_else(|| invalid("command targets"))?;
    validate_roots(targets)?;
    if request.operation == Operation::Switch {
        return Ok(targets.clone());
    }
    if request.options.lane.is_some() {
        return lane_selected(context, targets);
    }

    if let Some(pattern) = &request.options.pattern {
        if request.options.all {
            return Err(invalid("command ambiguous selection"));
        }
        // Canonical multimatch treats ** as all scoped IDs. An explicit pattern
        // also selects fast-forward targets, unlike bare merge's divergent set.
        if request.operation == Operation::Merge && pattern == "**" && !targets.is_empty() {
            return Ok(targets.clone());
        }
        return select_pattern(targets, pattern);
    }
    if request.operation == Operation::Checkout
        && !request.options.all
        && !matches!(request.options.to.as_deref(), Some("head" | "latest"))
    {
        return Err(invalid("command checkout requires selection"));
    }
    Ok(targets.clone())
}

fn lane_selected(context: &Value, targets: &[Value]) -> io::Result<Vec<Value>> {
    let selected =
        context["lane"]["targets"].as_array().ok_or_else(|| invalid("command lane selection"))?;
    let mut pool = targets.to_vec();
    if let Some(inactive) = context["lane"]["inactiveTargets"].as_array() {
        pool.extend(inactive.iter().cloned());
    }
    validate_roots(&pool)?;
    Ok(pool
        .into_iter()
        .filter(|target| {
            selected
                .iter()
                .any(|row| row["identity"] == target["identity"])
        })
        .collect())
}

fn validate_roots(targets: &[Value]) -> io::Result<()> {
    let mut roots = targets
        .iter()
        .map(|target| target["directory"].as_str().ok_or_else(|| invalid("command component root")))
        .collect::<io::Result<Vec<_>>>()?;
    roots.sort_unstable_by(|left, right| {
        std::path::Path::new(left).cmp(std::path::Path::new(right))
    });
    if roots.contains(&".")
        || roots
            .windows(2)
            .any(|pair| std::path::Path::new(pair[1]).starts_with(pair[0]))
    {
        return Err(invalid("command nested component roots"));
    }
    Ok(())
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
    if let Some(rows) = context["lane"]["inactiveTargets"].as_array() {
        model_targets.extend(
            rows.iter()
                .map(|row| json!({"identity":row["identity"],"version":row["version"]})),
        );
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
