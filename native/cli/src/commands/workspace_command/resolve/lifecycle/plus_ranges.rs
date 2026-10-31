//! The workspace snapshot range feature gate runs after pre-snap callbacks.
use super::{Session, capture};
use serde_json::{Value, json};
use std::{env, fs, io, path::Path};

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

fn plan_identity(value: &Value) -> Option<String> {
    if let Some(raw) = value
        .as_str()
        .or_else(|| value["id"].as_str())
    {
        return Some(
            raw.split('@')
                .next()
                .unwrap_or(raw)
                .to_owned(),
        );
    }
    let name = value["name"]
        .as_str()
        .filter(|name| !name.is_empty())?;
    Some(
        value["scope"]
            .as_str()
            .filter(|scope| !scope.is_empty())
            .map_or_else(|| name.to_owned(), |scope| format!("{scope}/{name}")),
    )
}

fn row_identity(row: &Value) -> Option<&str> {
    row["identity"]
        .as_str()
        .or_else(|| row["id"].as_str())
        .map(|raw| raw.split('@').next().unwrap_or(raw))
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
        .get(identity)
        .and_then(|state| state["entries"].as_array())
        .into_iter()
        .flatten()
        .map(|entry| {
            let id = entry
                .get("identity")
                .or_else(|| entry.get("id"))
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
            file.as_str()
                .or_else(|| file["relativePath"].as_str())
                .or_else(|| file["path"].as_str())
        })
        .find(|file| matches!(*file, "env.jsonc" | "env.json"));
    let Some(file) = file else { return Ok(None) };
    let directory = component["directory"]
        .as_str()
        .or_else(|| component["rootDir"].as_str())
        .unwrap_or_default();
    let path = component["sourceOverlays"][file]
        .as_str()
        .map_or_else(|| root.join(directory).join(file), std::path::PathBuf::from);
    Ok(bit_object_import::parse_jsonc(&fs::read(path)?).ok())
}
fn enabled() -> io::Result<bool> {
    let global =
        bit_install::config::load_global_config(&bit_workspace_config::global_config_dir())?;
    let features = env::var("BIT_FEATURES")
        .ok()
        .filter(|value| !value.is_empty())
        .or_else(|| env::var("BIT_CONFIG_FEATURES").ok())
        .or_else(|| {
            global
                .get("features")
                .and_then(Value::as_str)
                .map(str::to_owned)
        });
    Ok(features.is_some_and(|features| {
        features
            .split(',')
            .any(|feature| feature.trim() == "plus-range-versions")
    }))
}
