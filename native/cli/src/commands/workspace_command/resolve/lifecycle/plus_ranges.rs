//! The workspace snapshot range feature gate runs after pre-snap callbacks.
//!
//! [`validate`] checks [`Session`] and [`capture`] dependency [`Value`] ranges against the feature flag.
use super::{Session, capture};
use serde_json::{Value, json};
use std::{env, fs, io, path::Path};

/// Validate that `+^` and `+~` dependency version ranges are gated by the `plus-range-versions` feature.
pub(super) fn validate(session: &Session<'_>, plan: &Value) -> io::Result<()> {
    if enabled()? {
        return Ok(());
    }
    let mut details = Vec::new();
    for (identity, component) in targets(session, plan) {
        let usages = component_usages(session, &identity, component)?;
        if !usages.is_empty() {
            details.push(format!(
                "{identity}\n{}",
                usages
                    .iter()
                    .map(|usage| format!("  {usage}"))
                    .collect::<Vec<_>>()
                    .join("\n"),
            ));
        }
    }
    if details.is_empty() {
        return Ok(());
    }
    Err(io::Error::other(format!(
        r#"the following components use "+^"/"+~" versions, which are not supported yet:
{}
older bit versions, including the one that builds and releases on bit.cloud, write them as is to the package.json.
use "+" or a semver range instead. to use them anyway, run "bit config set features=plus-range-versions""#,
        details.join("\n"),
    )))
}
/// Collects deduplicated `(identity, captured_component)` pairs for selected and auto-snapped targets in `plan`.
fn targets<'a>(session: &'a Session<'_>, plan: &'a Value) -> Vec<(String, &'a Value)> {
    let mut seen = Vec::new();
    let mut targets = Vec::new();
    for value in ["selectedIds", "needsSnap"]
        .into_iter()
        .flat_map(|field| {
            plan[field]
                .as_array()
                .into_iter()
                .flatten()
        })
    {
        let Some(identity) = plan_identity(value) else { continue };
        if seen.contains(&identity) {
            continue;
        }
        seen.push(identity.clone());
        if let Some(component) = session.capture.captured
            .iter()
            .find(|row| row_identity(row) == Some(identity.as_str()))
        {
            targets.push((identity, component));
        }
    }
    targets
}

/// Extracts a trimmed, non-empty string slice from `value`.
#[inline]
fn non_empty_str(value: &Value) -> Option<&str> {
    value
        .as_str()
        .map(str::trim)
        .filter(|text| !text.is_empty())
}

#[inline]
fn plan_identity(value: &Value) -> Option<String> {
    if let Some(raw) = non_empty_str(value).or_else(|| non_empty_str(&value["id"])) {
        let bare = bit_install::config::aspect_id_without_version(raw).trim();
        return (!bare.is_empty()).then(|| bare.to_owned());
    }
    let name = non_empty_str(&value["name"])?;
    Some(
        non_empty_str(&value["scope"])
            .map_or_else(|| name.to_owned(), |scope| format!("{scope}/{name}")),
    )
}

#[inline]
fn row_identity(row: &Value) -> Option<&str> {
    non_empty_str(&row["identity"])
        .or_else(|| non_empty_str(&row["id"]))
        .map(|raw| bit_install::config::aspect_id_without_version(raw).trim())
        .filter(|bare| !bare.is_empty())
}

fn component_usages(
    session: &Session<'_>,
    identity: &str,
    component: &Value,
) -> io::Result<Vec<String>> {
    let callback = capture::snapshot_data(&session.capture, identity);
    let dependencies = callback
        .and_then(|data| data["rangeDependencies"].as_array())
        .cloned()
        .unwrap_or_else(|| dependencies(session, identity));
    let extensions = callback
        .and_then(|data| data["extensions"].as_array())
        .or_else(|| component["current"]["extensions"].as_array())
        .map_or(&[][..], Vec::as_slice);
    let environment = environment(session.root, component)?;
    Ok(bit_object_import::plus_range_versions::usages(
        &dependencies,
        extensions,
        environment.as_ref(),
    ))
}
fn dependencies(session: &Session<'_>, identity: &str) -> Vec<Value> {
    session
        .capture
        .dependency_states
        .get(identity.trim())
        .and_then(|state| state["entries"].as_array())
        .into_iter()
        .flatten()
        .map(|entry| {
            let id = [entry.get("identity"), entry.get("id")]
                .into_iter()
                .flatten()
                .find(|val| !val.is_null() && val.as_str().is_none_or(|text| !text.trim().is_empty()))
                .cloned()
                .unwrap_or(Value::Null);
            json!({"id": id, "packageName": entry["packageName"], "versionRange": entry["versionRange"]})
        })
        .collect()
}

fn environment(root: &Path, component: &Value) -> io::Result<Option<Value>> {
    let file = component["files"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|file| {
            non_empty_str(file)
                .or_else(|| non_empty_str(&file["relativePath"]))
                .or_else(|| non_empty_str(&file["path"]))
                .or_else(|| non_empty_str(&file["filePath"]))
        })
        .find(|file| matches!(file.trim_start_matches("./"), "env.jsonc" | "env.json"));
    let Some(file) = file else { return Ok(None) };
    let directory = non_empty_str(&component["directory"])
        .or_else(|| non_empty_str(&component["rootDir"]))
        .unwrap_or_default();
    let path = non_empty_str(&component["sourceOverlays"][file])
        .map_or_else(|| root.join(directory).join(file), std::path::PathBuf::from);
    Ok(bit_object_import::parse_jsonc(&fs::read(path)?).ok())
}
#[inline]
fn has_plus_range_feature(features: &str) -> bool {
    features
        .split(',')
        .any(|feature| feature.trim() == "plus-range-versions")
}

#[inline]
fn enabled() -> io::Result<bool> {
    for key in ["BIT_FEATURES", "BIT_CONFIG_FEATURES"] {
        if let Ok(val) = env::var(key) {
            let trimmed = val.trim();
            if !trimmed.is_empty() {
                return Ok(has_plus_range_feature(trimmed));
            }
        }
    }
    let global =
        bit_install::config::load_global_config(&bit_workspace_config::global_config_dir())?;
    Ok(global
        .get("features")
        .and_then(non_empty_str)
        .is_some_and(has_plus_range_feature))
}
