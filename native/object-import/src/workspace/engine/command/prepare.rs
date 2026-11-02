//! Workspace command [`context`], [`checkout_import`], [`checkout_lane`], and [`roots`] preparation.
mod checkout_import;
mod checkout_lane;
mod checkout_scope;
mod roots;
#[cfg(test)]
mod tests;
use super::input::{Operation, Prepare};
use crate::{
    command_import,
    workspace::engine::{client_status::config, invalid, status_context, status_models},
};
use serde_json::{Value, json};
use std::io;
#[inline]
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
    if request.operation == Operation::Checkout
        && request.options.to
            .as_deref()
            .map(str::trim)
            .is_some_and(|to| to.eq_ignore_ascii_case("head"))
    {
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
        .map(str::trim)
        .is_some_and(|to| is_local_checkout_target(to, request.options.revert));
    if local_target {
        let cached = command_import::prepare_cached(&request.root, &request.global_remotes_file)?;
        let default_scope = crate::component_tracking::identity::workspace_aspect(
            &context["workspace"],
        )["defaultScope"]
            .as_str()
            .ok_or_else(|| invalid("command default scope"))?;
        if targets.iter().all(|target| target.scope.is_none())
            || cached.all_external_targets_unmapped(&targets, default_scope)
        {
            return Ok(cached);
        }
    }
    command_import::prepare(&request.root, &request.global_remotes_file, &targets)
}
#[inline]
fn is_local_checkout_target(to: &str, revert: bool) -> bool {
    !to.is_empty()
        && (revert && to.eq_ignore_ascii_case("main")
            || !["head", "latest", "main"]
                .iter()
                .any(|kw| to.eq_ignore_ascii_case(kw))
                && !to
                    .get(..5)
                    .is_some_and(|prefix| prefix.eq_ignore_ascii_case("head~")))
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
            let (scope, name) = target["identity"]
                .as_str()?
                .trim()
                .split_once('/')?;
            let (scope, name) = (scope.trim(), name.trim());
            let dir = target["directory"].as_str().map(str::trim);
            rows.iter()
                .any(|(key, row)| matches_unexported_row(key, row, scope, name, dir))
                .then(|| command_import::Target {
                    scope: Some(scope.to_owned()),
                    name: name.to_owned(),
                    version: "latest".into(),
                })
        })
        .collect())
}
fn matches_unexported_row(
    key: &str,
    row: &Value,
    scope: &str,
    name: &str,
    dir: Option<&str>,
) -> bool {
    if key.trim().starts_with('$')
        || matches!(key.trim(), "_bit_lane" | "version")
        || !row.is_object()
    {
        return false;
    }
    let (row_scope, row_name) = crate::reset_lane::bitmap::row_identity(key, row);
    let row_scope = row_scope
        .map(str::trim)
        .filter(|val| !val.is_empty());
    row_name.trim() == name
        && (row_scope.is_none() || (row_scope == Some(scope) && row["exported"] == false))
        && row["rootDir"].as_str().map(str::trim) == dir
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
    let Value::Object(models) = models else {
        return Err(invalid("command models"));
    };
    context
        .as_object_mut()
        .ok_or_else(|| invalid("command context"))?
        .extend(models);
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
    let checkout_head = request.operation == Operation::Checkout
        && options.to
            .as_deref()
            .is_some_and(|to| to.trim().eq_ignore_ascii_case("head"));
    let invalid_strategy = options.strategy
        .as_deref()
        .map(str::trim)
        .is_some_and(|value| !matches!(value, "ours" | "theirs" | "manual"));
    let invalid_scope = options.scope.include_new_from_scope && !checkout_head
        || !options.scope.include_new_from_scope
            && !options.scope.scope_candidates.is_empty();
    let invalid_switch_flags = request.operation != Operation::Switch
        && (options.force_ours && options.force_theirs || invalid_strategy);
    Ok(!options.skip_dependency_installation
        || invalid_scope
        || options.workspace_only && !checkout_head
        || invalid_switch_flags
        || request.root.join("merge-conflict").try_exists()?)
}

fn validate_revert(request: &Prepare) -> io::Result<()> {
    if !request.options.revert || super::lane_history::phase(&request.options).is_some() {
        return Ok(());
    }
    let has_pattern = request.options.pattern
        .as_deref()
        .is_some_and(|pat| !pat.trim().is_empty());
    let valid_to = request.options.to
        .as_deref()
        .is_some_and(|to| {
            let lower = to.trim().to_ascii_lowercase();
            lower == "main"
                || (!lower.is_empty()
                    && !matches!(lower.as_str(), "head" | "latest" | "reset")
                    && !lower.starts_with("head~"))
        });
    if request.operation != Operation::Checkout || !has_pattern || request.options.all || !valid_to
    {
        return Err(invalid("command revert requires a selected version"));
    }
    Ok(())
}
fn import_targets(request: &Prepare) -> io::Result<Vec<command_import::Target>> {
    let bitmap = config::document(&request.root.join(".bitmap"))?;
    bitmap
        .as_object()
        .ok_or_else(|| invalid("command bitmap"))?
        .iter()
        .filter(|(key, value)| {
            !key.starts_with('$') && *key != "_bit_lane" && *key != "version" && value.is_object()
        })
        .map(|(key, value)| {
            let (scope, name) = crate::reset_lane::bitmap::row_identity(key, value);
            let name = name.trim();
            if name.is_empty() {
                return Err(invalid("command component name"));
            }
            let key_ver = key.rsplit_once('@').map_or("", |(_, ver)| ver.trim());
            let version = match value
                .get("version")
                .filter(|val| !val.is_null())
            {
                Some(val) => val
                    .as_str()
                    .map(str::trim)
                    .ok_or_else(|| invalid("command component version"))?,
                None => key_ver,
            };
            let scope = scope
                .map(str::trim)
                .filter(|sc| !sc.is_empty())
                .map(str::to_owned);
            Ok(command_import::Target { scope, name: name.to_owned(), version: version.to_owned() })
        })
        .collect()
}

pub(super) fn selected(request: &Prepare, context: &Value) -> io::Result<Vec<Value>> {
    let targets = context["targets"].as_array().ok_or_else(|| invalid("command targets"))?;
    roots::validate(targets)?;
    if super::lane_history::phase(&request.options).is_some()
        || request.operation == Operation::Switch
        || request.defer_checkout_pattern
    {
        return Ok(targets.clone());
    }
    if let Some(selected) = super::checkout_stash::selected(&request.options, targets)? {
        return Ok(selected);
    }
    if request.options.lane.is_some() {
        return lane_selected(context, targets);
    }
    if let Some(pattern) = request.options.pattern
        .as_deref()
        .map(str::trim)
        .filter(|pat| !pat.is_empty())
    {
        return selected_pattern(request, targets, pattern);
    }
    selected_checkout(request, context, targets)
}

fn selected_checkout(
    request: &Prepare,
    context: &Value,
    targets: &[Value],
) -> io::Result<Vec<Value>> {
    let to = request.options.to.as_deref().map(str::trim);
    if request.operation == Operation::Checkout
        && !request.options.all
        && !to.is_some_and(|to| {
            to.eq_ignore_ascii_case("head") || to.eq_ignore_ascii_case("latest")
        })
    {
        return Err(invalid("command checkout requires selection"));
    }
    if request.operation == Operation::Checkout
        && to.is_some_and(|to| to.eq_ignore_ascii_case("head"))
        && !context["lane"]["current"].is_null()
    {
        return checkout_lane::selected_heads(context, targets);
    }
    Ok(targets.to_vec())
}

fn selected_pattern(request: &Prepare, targets: &[Value], pattern: &str) -> io::Result<Vec<Value>> {
    if request.options.all {
        return Err(invalid("command ambiguous selection"));
    }
    if (request.operation == Operation::Merge || request.options.revert)
        && pattern == "**"
        && !targets.is_empty()
    {
        return Ok(targets.to_vec());
    }
    roots::select_pattern(targets, pattern)
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
            let target_id = target["identity"].as_str().map(str::trim);
            selected
                .iter()
                .any(|row| row["identity"].as_str().map(str::trim) == target_id)
        })
        .collect())
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
