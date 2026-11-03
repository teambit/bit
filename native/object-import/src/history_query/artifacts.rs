//! `teambit.pipelines/builder` artifact inventory validation ([`validate`], [`validate_artifacts`], [`validate_file`]) for repository history queries.

use super::invalid;
use serde_json::Value;
use std::io;

/// Validates `teambit.pipelines/builder` artifact entries in a `Version` JSON `value`.
pub(super) fn validate(value: &Value) -> io::Result<()> {
    let Some(entries) = value.get("extensions").and_then(Value::as_array) else {
        return Ok(());
    };
    let Some(builder) = find_builder_extension(entries) else {
        return Ok(());
    };
    let Some(artifacts) = builder
        .get("data")
        .and_then(|data| data.get("artifacts"))
        .filter(|value| !value.is_null() && value.as_bool() != Some(false))
    else {
        return Ok(());
    };
    validate_artifacts(artifacts)
}
/// Validates the `teambit.pipelines/builder` `artifacts` [`Value`] array and per-artifact file budgets via [`validate_file`].
fn validate_artifacts(artifacts: &Value) -> io::Result<()> {
    let artifacts =
        artifacts.as_array().ok_or_else(|| invalid("history query builder artifact array"))?;
    if artifacts.len() > 4096 {
        return Err(invalid("history query artifact count"));
    }
    let mut count = 0;
    for artifact in artifacts {
        if !artifact.is_object() {
            return Err(invalid("history query artifact object"));
        }
        let Some(files) = artifact.get("files") else { continue };
        let files = files.as_array().ok_or_else(|| invalid("history query artifact files"))?;
        count += files.len();
        if count > 4096 {
            return Err(invalid("history query artifact file count"));
        }
        for file in files {
            validate_file(file)?;
        }
    }
    Ok(())
}
/// Validates a single builder artifact file [`Value`] entry (`file` hash, safe `relativePath`, and `url`).
fn validate_file(file: &Value) -> io::Result<()> {
    let reference = file
        .get("file")
        .and_then(Value::as_str)
        .ok_or_else(|| invalid("history query artifact Source ref"))?;
    crate::merge_history::hash(reference.trim())?;
    let path = file
        .get("relativePath")
        .and_then(Value::as_str)
        .ok_or_else(|| invalid("history query artifact path"))?;
    let trimmed = path.trim();
    if trimmed.is_empty()
        || path.len() > 32768
        || path.as_bytes().contains(&0)
        || std::path::Path::new(trimmed)
            .components()
            .any(|part| {
                matches!(
                    part,
                    std::path::Component::ParentDir
                        | std::path::Component::RootDir
                        | std::path::Component::Prefix(_),
                )
            })
        || file
            .get("url")
            .is_some_and(|value| {
                value
                    .as_str()
                    .is_none_or(|url| url.len() > 32768 || url.as_bytes().contains(&0))
            })
    {
        return Err(invalid("history query artifact metadata"));
    }
    Ok(())
}

/// Finds the `teambit.pipelines/builder` aspect entry in `Version` `extensions` [`Value`] `entries`, if present.
#[inline]
fn find_builder_extension(entries: &[Value]) -> Option<&Value> {
    entries
        .iter()
        .find(|entry| {
            crate::workspace::engine::client_status::config::is_extension_aspect(
                entry,
                "teambit.pipelines/builder",
            )
        })
}
