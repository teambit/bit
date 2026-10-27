//! Built-in pending-directory actions for file remotes, without loading the published runtime.
mod removal;

use serde_json::{Value, json};
use std::{
    fs, io,
    path::{Path, PathBuf},
    time::Duration,
};

pub(super) fn supports(name: &str) -> bool {
    matches!(name, "PendingDirStatus" | "RemovePendingDir")
}

pub(super) fn prepare(path: &Path) -> io::Result<Option<PathBuf>> {
    let absolute = std::path::absolute(path)?;
    let scope = crate::workspace::root(&absolute)
        .map(|root| crate::workspace::scope_path(&root))
        .or_else(|| {
            absolute
                .ancestors()
                .find(|candidate| candidate.join("scope.json").is_file())
                .map(Path::to_path_buf)
        });
    if let Some(scope) = &scope {
        let Ok(bytes) = fs::read(scope.join("scope.json")) else { return Ok(None) };
        let Ok(json) = serde_json::from_slice::<Value>(&bytes) else { return Ok(None) };
        if json["name"].as_str().is_none_or(str::is_empty) || !scope.join("objects").is_dir() {
            return Ok(None);
        }
    }
    Ok(scope)
}

pub(super) fn action(scope: &Path, name: &str, payload: &Value) -> io::Result<Value> {
    if !supports(name) {
        return Err(io::Error::other("unsupported native file action"));
    }
    let path = pending_path(scope, payload.get("clientId"))?;
    let existed = path.exists();
    if name == "PendingDirStatus" {
        return Ok(json!({"exists":existed}));
    }
    match removal::remove(&path) {
        Err(error) if error.kind() == io::ErrorKind::DirectoryNotEmpty => {
            std::thread::sleep(Duration::from_secs(1));
            removal::remove(&path)?;
        }
        result => result?,
    }
    Ok(json!({"existed":existed}))
}

fn pending_path(scope: &Path, value: Option<&Value>) -> io::Result<PathBuf> {
    let valid = value
        .and_then(Value::as_str)
        .filter(|id| {
            !id.is_empty()
                && !matches!(*id, "." | "..")
                && id.encode_utf16().count() <= 4096
                && !id
                    .chars()
                    .any(|character| {
                        matches!(
                            character,
                            '/' | '\\' | '\0' | '<' | '>' | '|' | '?' | '*' | ':' | '"',
                        )
                    })
        });
    let Some(id) = valid else {
        let shown = value.map_or_else(|| "undefined".to_owned(), Value::to_string);
        return Err(io::Error::other(format!("invalid clientId: {shown}")));
    };
    Ok(scope.join("pending-objects").join(id))
}
