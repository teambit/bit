//! Missing current directories and intentionally incomplete reset captures.

use super::{Capture, Component, decline, full_identity, text};
use serde_json::{Value, json};
use std::{io, path::Path};

pub(super) fn status_removed(target: &Value, captured: &mut Capture) -> io::Result<bool> {
    if target["locallyRemoved"] != true {
        return Ok(false);
    }
    captured.components.push(Component {
        identity: full_identity(target)?,
        package_name: String::new(),
        dependencies: Vec::new(),
        issues: Value::Null,
    });
    Ok(true)
}

pub(super) fn capture(
    root: &Path,
    enabled: bool,
    target: &Value,
    directory: &str,
    captured: &mut Capture,
) -> io::Result<bool> {
    if !enabled || !missing(&root.join(directory))? {
        return Ok(false);
    }
    record_incomplete(target, directory, &[], captured)?;
    Ok(true)
}

pub(super) fn status_invalid(
    root: &Path,
    target: &Value,
    directory: &str,
    captured: &mut Capture,
) -> io::Result<bool> {
    if directory == "." || !missing(&root.join(directory))? {
        return Ok(false);
    }
    record_status_invalid(target, component_not_found(directory), captured)?;
    Ok(true)
}

pub(super) fn status_invalid_files(
    root: &Path,
    target: &Value,
    directory: &str,
    files: &[String],
    captured: &mut Capture,
) -> io::Result<bool> {
    if directory != "." && files.is_empty() {
        record_status_invalid(target, component_not_found(directory), captured)?;
        return Ok(true);
    }
    let main = text(target.get("mainFile"))?;
    if files.iter().any(|file| file == main) || !missing(&root.join(directory).join(main))? {
        return Ok(false);
    }
    record_status_invalid(
        target,
        json!({
            "isUserError":true,"name":"MainFileRemoved","mainFile":main,
            "id":text(target.get("identity"))?,
        }),
        captured,
    )?;
    Ok(true)
}

fn component_not_found(directory: &str) -> Value {
    json!({"isUserError":true,"name":"ComponentNotFoundInPath","code":127,"path":directory})
}

fn record_status_invalid(target: &Value, error: Value, captured: &mut Capture) -> io::Result<()> {
    let identity = text(target.get("identity"))?;
    captured.invalid.insert(identity.to_owned(), error);
    captured.components.push(Component {
        identity: full_identity(target)?,
        package_name: String::new(),
        dependencies: Vec::new(),
        issues: Value::Null,
    });
    Ok(())
}

pub(super) fn main_file(
    root: &Path,
    enabled: bool,
    target: &Value,
    directory: &str,
    files: &[String],
    captured: &mut Capture,
) -> io::Result<bool> {
    let main = target.get("mainFile").and_then(Value::as_str);
    if main.is_some_and(|main| files.iter().any(|file| file == main)) {
        return Ok(false);
    }
    if enabled
        && let Some(main) = main
        && missing(&root.join(directory).join(main))?
    {
        record_incomplete(target, directory, files, captured)?;
        return Ok(true);
    }
    Err(decline("status main file not captured"))
}

fn missing(path: &Path) -> io::Result<bool> {
    match path.symlink_metadata() {
        Ok(_) => Ok(false),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(true),
        Err(error) => Err(error),
    }
}

pub(super) fn record_incomplete(
    target: &Value,
    directory: &str,
    files: &[String],
    captured: &mut Capture,
) -> io::Result<()> {
    let main_file = text(target.get("mainFile"))?;
    captured.captured.push(json!({
        "identity": target["identity"],
        "version": target["version"],
        "directory": directory,
        "files": files,
        "current": { "mainFile": main_file },
        "peerDependencies": [],
    }));
    Ok(())
}
