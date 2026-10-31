//! Read-only native diagnoses of indexed models and legacy symlinks.
use super::catalog::Diagnosis;
use serde_json::{Value, json};
use sha1::{Digest, Sha1};
use std::{
    fs, io,
    path::{Path, PathBuf},
};

pub(super) fn object(scope: &Path, hash: &str) -> io::Result<Option<(String, Value)>> {
    bit_object_import::read_scope_object(scope, hash)
}

fn path(scope: &Path, hash: &str) -> PathBuf {
    scope
        .join("objects")
        .join(&hash[..2])
        .join(&hash[2..])
}
pub(super) fn heads(diagnosis: &Diagnosis, scope: Option<&Path>) -> io::Result<Value> {
    let Some(scope) = scope else {
        return Ok(diagnosis.result(json!({"valid":true}), String::new(), ""));
    };
    let config: Value = bit_object_import::parse_jsonc(&fs::read(scope.join("scope.json"))?)?;
    let scope_name = config["name"].as_str().unwrap_or_default();
    let index = read_index(scope)?;
    let models = index
        .as_array()
        .or_else(|| index["components"].as_array());
    let mut missing = Vec::new();
    let mut total = 0;
    for row in models
        .into_iter()
        .flatten()
        .filter(|row| {
            let (row_scope, _) = row_scope_and_name(row);
            row["isSymlink"] != true && (row_scope == scope_name || row_scope.is_empty())
        })
    {
        let (_, model) = object(scope, text(&row["hash"])?)?
            .ok_or_else(|| io::Error::other("scope index references a missing component object"))?;
        total += 1;
        if let Some(head) = model["head"]
            .as_str()
            .filter(|head| !head.is_empty())
            && object(scope, head)?.is_none()
        {
            missing.push(json!({"id":identity(&model),"head":head}));
        }
    }
    let symptoms = missing_head_symptoms(&missing);
    Ok(diagnosis.result(json!({"valid":missing.is_empty(),"data":{"componentsWithMissingHeads":missing,"totalComponents":total}}),symptoms,"The missing objects need to be restored from backups or re-exported from workspaces that have these components."))
}
fn missing_head_symptoms(missing: &[Value]) -> String {
    format!(
        "the following components have missing head version objects:\n{}",
        missing
            .iter()
            .map(|row| format!(
                "  {} (head: {})",
                row["id"].as_str().unwrap_or_default(),
                row["head"].as_str().unwrap_or_default()
            ))
            .collect::<Vec<_>>()
            .join("\n"),
    )
}
fn read_index(scope: &Path) -> io::Result<Value> {
    match fs::read(scope.join("index.json")) {
        Ok(bytes) => bit_object_import::parse_jsonc(&bytes),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(json!([])),
        Err(error) => Err(error),
    }
}
fn row_scope_and_name(row: &Value) -> (&str, &str) {
    if let Some(id_str) = row["id"].as_str() {
        let bare = id_str
            .split('@')
            .next()
            .unwrap_or(id_str);
        return bare
            .split_once('/')
            .unwrap_or(("", bare));
    }
    (
        row["id"]["scope"].as_str().unwrap_or_default(),
        row["id"]["name"].as_str().unwrap_or_default(),
    )
}
fn text(value: &Value) -> io::Result<&str> {
    value.as_str().ok_or_else(|| io::Error::other("invalid scope index"))
}
fn identity(model: &Value) -> String {
    let name = model["name"].as_str().unwrap_or_default();
    model["scope"]
        .as_str()
        .filter(|scope| !scope.is_empty())
        .map_or_else(|| name.into(), |scope| format!("{scope}/{name}"))
}
pub(super) fn orphans(diagnosis: &Diagnosis, scope: &Path) -> io::Result<Value> {
    let index = read_index(scope)?;
    let mut orphans = Vec::new();
    let mut paths = Vec::new();
    for hash in references(scope)? {
        let Some((kind, value)) = object(scope, &hash)? else {
            continue;
        };
        if kind != "Symlink" {
            continue;
        }
        let id = json!({"scope":value["realScope"],"name":value["name"]});
        if !symlink_target_exists(scope, &index, &id)? {
            orphans.push(json!({"_legacy":id}));
            paths.push(path(scope, &hash));
        }
    }
    let ids = orphans
        .iter()
        .map(|id| identity(&id["_legacy"]))
        .collect::<Vec<_>>()
        .join(", ");
    let treatment = format!(
        "please delete the following paths:\n{}",
        paths
            .iter()
            .map(|path| path.display().to_string())
            .collect::<Vec<_>>()
            .join("\n"),
    );
    Ok(diagnosis.result(json!({"valid":orphans.is_empty(),"data":{"orphanSymlinks":orphans,"objectsToDelete":paths}}),format!(r#"the following refs points to non-existing components "{ids}""#),&treatment))
}

fn symlink_target_exists(scope: &Path, index: &Value, id: &Value) -> io::Result<bool> {
    let target_scope = id["scope"].as_str().unwrap_or_default();
    let target_name = id["name"].as_str().unwrap_or_default();
    let rows = index
        .as_array()
        .or_else(|| index["components"].as_array());
    for row in rows.into_iter().flatten() {
        let (row_scope, row_name) = row_scope_and_name(row);
        if row["isSymlink"] != true
            && row_name == target_name
            && (row_scope == target_scope || row_scope.is_empty() || target_scope.is_empty())
            && let Some(hash) = row["hash"]
                .as_str()
                .filter(|val| !val.is_empty())
            && object(scope, hash)?.is_some()
        {
            return Ok(true);
        }
    }
    let scoped = format!("{:x}", Sha1::digest(identity(id).as_bytes()));
    if object(scope, &scoped)?.is_some() {
        return Ok(true);
    }
    if !target_name.is_empty() {
        let bare = format!("{:x}", Sha1::digest(target_name.as_bytes()));
        if object(scope, &bare)?.is_some() {
            return Ok(true);
        }
    }
    Ok(false)
}
fn references(scope: &Path) -> io::Result<Vec<String>> {
    // Published Repository.listRefs uses a backslash glob on Windows and finds none.
    if cfg!(windows) {
        return Ok(Vec::new());
    }
    let mut references = Vec::new();
    let directory = scope.join("objects");
    if !directory.exists() {
        return Ok(references);
    }
    for prefix in fs::read_dir(directory)? {
        let prefix = prefix?;
        if !prefix.file_type()?.is_dir() {
            continue;
        }
        for entry in fs::read_dir(prefix.path())? {
            let entry = entry?;
            let hash = format!(
                "{}{}",
                prefix.file_name().to_string_lossy(),
                entry.file_name().to_string_lossy(),
            );
            if is_reference(&hash) {
                references.push(hash);
            }
        }
    }
    references.sort_by(|left, right| right.cmp(left));
    Ok(references)
}

#[cfg(test)]
mod tests;

/// Scope index repair and malformed objects are left to the canonical loader before output.
pub(super) fn preflight(context: &super::context::Context, name: Option<&str>) -> io::Result<()> {
    if name.is_some_and(|name| name != "validate scope objects" && name != "check orphan refs") {
        return Ok(());
    }
    let Some(scope) = context.scope.as_deref() else {
        return Ok(());
    };
    if !scope.join("index.json").exists() && !references(scope)?.is_empty() {
        return Err(io::Error::other("scope index requires canonical rebuilding"));
    }
    let index = read_index(scope)?;
    let rows = index
        .as_array()
        .or_else(|| index["components"].as_array())
        .ok_or_else(|| io::Error::other("invalid component index"))?;
    for row in rows
        .iter()
        .filter(|row| row["isSymlink"] != true)
    {
        let (kind, model) = object(scope, text(&row["hash"])?)?
            .ok_or_else(|| io::Error::other("scope index requires canonical recovery"))?;
        if kind != "Component" {
            return Err(io::Error::other("indexed object is not a component"));
        }
        if let Some(head) = model["head"].as_str() {
            let _head = object(scope, head)?;
        }
    }
    Ok(())
}

fn is_reference(hash: &str) -> bool {
    hash.len() == 40 && hash.bytes().all(|byte| byte.is_ascii_hexdigit())
}
