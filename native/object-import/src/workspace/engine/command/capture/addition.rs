#[cfg(test)]
mod tests;

use super::{Captured, comparison, invalid};
use serde_json::{Value, json};
use std::io;

/// An incoming-only component has no current Consumer contents or version.
/// Its destination is prepared from canonical workspace directory configuration.
pub(in crate::workspace::engine::command) fn capture(
    identity: &str,
    destination: &Value,
) -> io::Result<Captured> {
    let identity = identity.trim();
    let scope = destination["scope"]
        .as_str()
        .map(str::trim)
        .ok_or_else(|| invalid("lane addition scope"))?;
    let name = destination["name"]
        .as_str()
        .map(str::trim)
        .ok_or_else(|| invalid("lane addition name"))?;
    if scope.is_empty() || name.is_empty() || identity != format!("{scope}/{name}") {
        return Err(invalid("lane addition identity"));
    }
    let directory = destination["rootDir"]
        .as_str()
        .map(str::trim)
        .ok_or_else(|| invalid("lane addition directory"))?;
    crate::checkout::plan::relative_path(directory)?;
    if directory == "." || directory.is_empty() {
        return Err(invalid("lane addition workspace root"));
    }
    Ok(Captured {
        added: true,
        hidden: false,
        model_backed: false,
        target: comparison::Target {
            source_overlays: std::collections::HashMap::new(),
            source_overlay_root: None,
            identity: identity.into(),
            version: String::new(),
            directory: directory.into(),
            files: Vec::new(),
            current: json!({}),
        },
        metadata: json!([]),
        files: json!([]),
    })
}
