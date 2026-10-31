//! Switch-specific argument checks precede lane lookup and remote acquisition.
use super::{Prepare, invalid, repository};
use crate::command_import;
use serde_json::Value;
use std::{io, path::Path};

pub(in super::super) fn options(request: &Prepare) -> io::Result<()> {
    let options = request.options.lane.as_ref().ok_or_else(|| invalid("switch lane missing"))?;
    if request.options.strategy
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .is_some_and(|value| !matches!(value, "ours" | "theirs" | "manual"))
    {
        return Err(canonical("merge must be one of the following: ours, theirs, manual".into()));
    }
    if let Some(alias) = options.alias
        .as_deref()
        .map(str::trim)
        .filter(|alias| !alias.is_empty())
    {
        validate_alias(alias)?;
    }
    if request.options.force_ours && request.options.force_theirs {
        return Err(canonical("please use either --force-ours or --force-theirs, not both".into()));
    }
    let checkout = request.options.to.is_some()
        || request.options.pattern.is_some()
        || request.options.message.is_some()
        || request.options.all
        || request.options.no_snap;
    let lane = options.include_deps || options.exclude_non_lane_comps || options.no_auto_snap;
    if checkout || lane || options.no_squash || options.squash {
        return Err(invalid("switch requires canonical lane options"));
    }
    Ok(())
}
fn validate_alias(alias: &str) -> io::Result<()> {
    if alias.len() > 800
        || !alias
            .bytes()
            .all(|byte| {
                byte.is_ascii_lowercase() || byte.is_ascii_digit() || b"-_!$".contains(&byte)
            })
    {
        return Err(canonical(format!(
            r#"lane "{alias}" has invalid characters. lane name can only contain alphanumeric, lowercase characters, and the following ["-", "_", "$", "!"]"#,
        )));
    }
    Ok(())
}
pub(super) fn canonical(message: String) -> io::Error {
    crate::workspace::engine::response::canonical(message)
}

pub(super) fn reject_removed_targets(
    root: &Path,
    context: &Value,
    imported: &command_import::PreparedImport,
) -> io::Result<()> {
    let scope = crate::scope_path(root);
    for target in context["targets"].as_array().ok_or_else(|| invalid("switch targets"))? {
        reject_removed_target(&scope, context, imported, target)?;
    }
    if let Some(rows) = context["lane"]["targets"].as_array() {
        reject_removed_lane_targets(&scope, imported, rows)?;
    }
    Ok(())
}

fn reject_removed_target(
    scope: &Path,
    context: &Value,
    imported: &command_import::PreparedImport,
    target: &Value,
) -> io::Result<()> {
    let identity = target["identity"]
        .as_str()
        .or_else(|| target["id"].as_str())
        .map(str::trim)
        .map(|id| id.rsplit_once('@').map_or(id, |(base, _)| base.trim()))
        .filter(|id| !id.is_empty())
        .ok_or_else(|| invalid("switch identity"))?;
    let Some(model) = repository::model(context, identity)? else { return Ok(()) };
    let version = target["switchVersion"]
        .as_str()
        .or_else(|| target["version"].as_str())
        .or_else(|| target["head"].as_str())
        .map(str::trim)
        .filter(|ver| !ver.is_empty())
        .ok_or_else(|| invalid("switch target version"))?;
    let Ok(hash) = super::super::selection::versions::reference(&model, version) else {
        return Ok(());
    };
    if is_version_removed(scope, imported, &hash)? {
        return Err(invalid("switch target version removed"));
    }
    Ok(())
}

fn reject_removed_lane_targets(
    scope: &Path,
    imported: &command_import::PreparedImport,
    rows: &[Value],
) -> io::Result<()> {
    for row in rows {
        if let Some(hash) = row["head"]
            .as_str()
            .or_else(|| row["version"].as_str())
            && is_version_removed(scope, imported, hash)?
        {
            return Err(invalid("switch target version removed"));
        }
    }
    Ok(())
}

fn is_version_removed(
    scope: &Path,
    imported: &command_import::PreparedImport,
    hash: &str,
) -> io::Result<bool> {
    let value = if let Some(value) = imported.overlay.read(hash, "Version")? {
        Some(value.clone())
    } else {
        crate::read_scope_object(scope, hash)?
            .and_then(|(kind, value)| (kind == "Version").then_some(value))
    };
    value.map_or(Ok(false), |version| super::super::selection::removed(&version))
}

pub(super) fn staged_main(root: &Path, context: &Value) -> io::Result<bool> {
    let bytes = match std::fs::read(crate::scope_path(root).join("staged-snaps")) {
        Ok(bytes) => bytes,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(false),
        Err(error) => return Err(error),
    };
    let staged = std::str::from_utf8(&bytes).map_err(io::Error::other)?;
    let staged = staged
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .collect::<std::collections::HashSet<_>>();
    let models = context["models"].as_array().ok_or_else(|| invalid("switch models"))?;
    Ok(models.iter().any(|model| model_staged(model, &staged)))
}

fn model_staged(model: &Value, staged: &std::collections::HashSet<&str>) -> bool {
    let versions = ["versions", "orphanedVersions"]
        .into_iter()
        .filter_map(|field| model[field].as_object())
        .flat_map(serde_json::Map::values)
        .filter_map(Value::as_str);
    model["head"]
        .as_str()
        .into_iter()
        .chain(versions)
        .map(str::trim)
        .any(|hash| staged.contains(hash))
}
