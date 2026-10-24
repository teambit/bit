use super::{PreparedImport, invalid, object_hash};
use serde_json::{Value, json};
use std::{io, path::PathBuf};
pub(super) fn settings(value: &Value) -> io::Result<()> {
    settings_for_lane(value, false)
}
pub(in crate::command_import) fn settings_for_lane(
    value: &Value,
    allow_lane: bool,
) -> io::Result<()> {
    let fields = value.as_object().ok_or_else(|| invalid("import scope settings"))?;
    if fields
        .keys()
        .any(|key| {
            !matches!(
                key.as_str(),
                "name" | "remotes" | "version" | "lanes" | "groupName" | "config",
            )
        })
        || value
            .get("config")
            .is_some_and(|config| !config.is_object())
        || (!allow_lane
            && value["lanes"]["current"]
                .as_str()
                .is_some_and(|lane| lane != "main"))
    {
        return Err(invalid("import scope needs canonical configuration"));
    }
    Ok(())
}
pub(super) fn remote(
    plan: &mut PreparedImport,
    remotes: &Value,
    name: &str,
) -> io::Result<PathBuf> {
    let directory = raw_remote(plan, remotes, name)?;
    // The published importer persists ScopeMeta for both file and HTTP
    // transfers, including when the remote has no matching component model.
    let hash = object_hash(name);
    if !plan.overlay.objects.contains_key(&hash) {
        let incoming = plan.capture.object(&directory, &hash, "ScopeMeta")?;
        if incoming
            .as_ref()
            .is_some_and(|record| {
                record.value
                    .as_ref()
                    .is_none_or(|value| value["name"] != name)
            })
        {
            return Err(invalid("import remote ScopeMeta identity"));
        }
        let record = match incoming {
            Some(record) => record,
            None => super::super::publish::object(&hash, "ScopeMeta", json!({"name":name}))?,
        };
        plan.overlay.objects.insert(hash, record);
    }
    Ok(directory)
}
pub(super) fn raw_remote(
    plan: &mut PreparedImport,
    remotes: &Value,
    name: &str,
) -> io::Result<PathBuf> {
    if name.is_empty()
        || name
            .bytes()
            .any(|byte| !byte.is_ascii_alphanumeric() && !b"._-".contains(&byte))
    {
        return Err(invalid("import scope identity"));
    }
    if let Some(path) = plan.environment.missing_global_remotes.take() {
        plan.environment.global_remotes = Some(path);
    }
    if let Some(directory) = plan.environment.remote_overrides.get(name).cloned() {
        validate_virtual(plan, &directory, name)?;
        return Ok(directory.join("objects"));
    }
    let host = remotes[name]
        .as_str()
        .ok_or_else(|| invalid("import unmapped remote requires canonical resolver"))?;
    let path = host
        .strip_prefix("file://")
        .ok_or_else(|| invalid("import remote protocol requires canonical transport"))?;
    let directory = PathBuf::from(path);
    if !directory.is_absolute() {
        return Err(invalid("import relative file remote"));
    }
    let scope = plan.capture
        .json(&directory.join("scope.json"))?
        .ok_or_else(|| invalid("import remote scope absent"))?;
    settings(&scope)?;
    if scope["name"] != name {
        return Err(invalid("import remote scope mismatch"));
    }
    validate_config(plan, &directory)?;
    Ok(directory.join("objects"))
}

fn validate_virtual(
    plan: &mut PreparedImport,
    directory: &std::path::Path,
    name: &str,
) -> io::Result<()> {
    let scope = plan.capture
        .json(&directory.join("scope.json"))?
        .ok_or_else(|| invalid("virtual remote scope absent"))?;
    if scope["name"] != name {
        return Err(invalid("virtual remote scope mismatch"));
    }
    Ok(())
}

fn validate_config(plan: &mut PreparedImport, directory: &std::path::Path) -> io::Result<()> {
    // A remote aspect runtime could alter fetch behavior; only plain scopes are owned.
    let config = plan.capture.json(&directory.join("scope.jsonc"))?;
    if config
        .as_ref()
        .is_some_and(|value| {
            value
                .as_object()
                .is_none_or(|fields| {
                    fields
                        .keys()
                        .any(|key| key != "$schema")
                })
        })
    {
        return Err(invalid("import remote custom aspects"));
    }
    Ok(())
}
