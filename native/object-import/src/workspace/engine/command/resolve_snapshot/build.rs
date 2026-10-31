#[cfg(test)]
mod tests;

// Builder metadata is projected into fixed native Version identities; artifact bytes stay native.

use super::{invalid, proof};
use serde::Deserialize;
use serde_json::{Value, json};
use sha1::{Digest, Sha1};
use std::{
    fs, io,
    path::{Component, Path, PathBuf},
};

const BUILDER: &str = "teambit.pipelines/builder";

pub(super) fn metadata(version: &mut Value, allocation: &Value) -> io::Result<()> {
    planned_tasks(version, allocation)?;
    let Some(data) = allocation.get("buildData") else { return Ok(()) };
    let status = data["buildStatus"].as_str().ok_or_else(|| invalid("snapshot build status"))?;
    if !matches!(status, "succeed" | "failed" | "pending" | "skipped") {
        return Err(invalid("snapshot build status"));
    }
    version["buildStatus"] = json!(status);
    let updates =
        data["extensions"].as_array().ok_or_else(|| invalid("snapshot build extensions"))?;
    let entries =
        version["extensions"].as_array_mut().ok_or_else(|| invalid("snapshot extensions"))?;
    for update in updates {
        extension(entries, update)?;
    }
    Ok(())
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct GeneratedFile {
    identity: String,
    artifact_index: usize,
    file_index: usize,
    relative_path: String,
    path: PathBuf,
    url: Option<String>,
}

pub(super) fn artifacts(
    receipt: &mut Value,
    objects: &mut Vec<Value>,
    proofs: &mut Vec<proof::Proof>,
) -> io::Result<()> {
    let Some(artifacts) = receipt.get("artifacts") else { return Ok(()) };
    let artifacts: Vec<GeneratedFile> =
        serde_json::from_value(artifacts.clone()).map_err(io::Error::other)?;
    if artifacts.is_empty() {
        return Ok(());
    }
    if artifacts.len() > 4096 {
        return Err(invalid("snapshot artifact count"));
    }
    let root = receipt["artifactRoot"].as_str().ok_or_else(|| invalid("snapshot artifact root"))?;
    let root = PathBuf::from(root);
    if !root.is_absolute() || !fs::symlink_metadata(&root)?.is_dir() {
        return Err(invalid("snapshot artifact root"));
    }
    let mut used = 0;
    for artifact in artifacts {
        regular(&root, &artifact.path)?;
        let size = fs::metadata(&artifact.path)?.len();
        used += usize::try_from(size).map_err(|_| invalid("snapshot artifact size"))?;
        if used > 32 * 1024 * 1024 {
            return Err(invalid("snapshot artifact byte budget"));
        }
        let bytes = proof::read(&artifact.path, proofs)?
            .ok_or_else(|| invalid("snapshot artifact missing"))?;
        let hash = crate::validate::hexadecimal(&Sha1::digest(&bytes));
        reference(receipt, &artifact, &hash)?;
        objects.push(
            json!({"type":"Source","hash":hash,"body":crate::validate::hexadecimal(&bytes)}),
        );
    }
    Ok(())
}

fn regular(root: &Path, path: &Path) -> io::Result<()> {
    let relative =
        path.strip_prefix(root).map_err(|_| invalid("snapshot artifact outside root"))?;
    if relative
        .components()
        .any(|part| !matches!(part, Component::Normal(_)))
        || !fs::symlink_metadata(path)?.is_file()
    {
        return Err(invalid("snapshot artifact must be a regular file"));
    }
    let mut parent = path.parent();
    while let Some(directory) = parent.filter(|directory| *directory != root) {
        if !fs::symlink_metadata(directory)?.is_dir() {
            return Err(invalid("snapshot artifact symlink parent"));
        }
        parent = directory.parent();
    }
    Ok(())
}

fn reference(receipt: &mut Value, artifact: &GeneratedFile, hash: &str) -> io::Result<()> {
    crate::checkout::plan::relative_path(&artifact.relative_path)?;
    let version = receipt["versions"]
        .as_array_mut()
        .ok_or_else(|| invalid("snapshot build versions"))?
        .iter_mut()
        .find(|version| version["identity"] == artifact.identity)
        .ok_or_else(|| invalid("snapshot artifact component"))?;
    let builder = version["buildData"]["extensions"]
        .as_array_mut()
        .ok_or_else(|| invalid("snapshot artifact extensions"))?
        .iter_mut()
        .find(|extension| {
            crate::workspace::engine::client_status::config::is_extension_aspect(extension, BUILDER)
        })
        .ok_or_else(|| invalid("snapshot artifact builder"))?;
    let file = builder["data"]["artifacts"]
        .get_mut(artifact.artifact_index)
        .and_then(|entry| entry["files"].get_mut(artifact.file_index))
        .ok_or_else(|| invalid("snapshot artifact location"))?;
    if file["relativePath"] != artifact.relative_path
        || file["file"] != "__native_artifact_pending__"
    {
        return Err(invalid("snapshot artifact reference binding"));
    }
    file["file"] = json!(hash);
    if let Some(url) = &artifact.url {
        file["url"] = json!(url);
    }
    Ok(())
}

fn extension(entries: &mut Vec<Value>, update: &Value) -> io::Result<()> {
    let name = update
        .get("name")
        .or_else(|| update.get("legacyId"));
    let id = update
        .get("extensionId")
        .or_else(|| update.get("id"));
    if name.is_none() && id.is_none() {
        return Err(invalid("snapshot builder extension identity"));
    }
    if let Some(entry) = entries
        .iter_mut()
        .find(|entry| {
            entry
                .get("name")
                .or_else(|| entry.get("legacyId"))
                == name
                && entry
                    .get("extensionId")
                    .or_else(|| entry.get("id"))
                    == id
        })
    {
        if let Some(data) = update.get("data") {
            entry["data"] = data.clone();
        }
    } else {
        let mut entry = update.clone();
        if entry.get("config").is_none() {
            entry["config"] = json!({});
        }
        entries.push(entry);
    }
    Ok(())
}

fn planned_tasks(version: &mut Value, allocation: &Value) -> io::Result<()> {
    let Some(tasks) = allocation
        .get("plannedTasks")
        .filter(|tasks| !tasks.is_null())
    else {
        return Ok(());
    };
    let rows = tasks.as_array().ok_or_else(|| invalid("snapshot planned task list"))?;
    for task in rows {
        validate_planned_task(task)?;
    }
    let extensions =
        version["extensions"].as_array_mut().ok_or_else(|| invalid("snapshot extensions"))?;
    if let Some(builder) = extensions
        .iter_mut()
        .find(|extension| {
            crate::workspace::engine::client_status::config::is_extension_aspect(extension, BUILDER)
        })
    {
        builder["data"] = json!({"plannedTasks": tasks});
    } else {
        extensions.push(json!({"name": BUILDER, "config": {}, "data": {"plannedTasks": tasks}}));
    }
    Ok(())
}

fn validate_planned_task(task: &Value) -> io::Result<()> {
    let valid_id = task["taskId"]
        .as_str()
        .is_some_and(|id| !id.trim().is_empty());
    let valid_name = task["taskName"]
        .as_str()
        .is_some_and(|name| !name.trim().is_empty());
    let valid_desc = task.get("taskDescription").is_none_or(Value::is_string);
    if !valid_id || !valid_name || !valid_desc {
        return Err(invalid("snapshot planned task descriptor"));
    }
    Ok(())
}
