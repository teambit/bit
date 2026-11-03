//! Destination capture ([`capture`], [`Captured`]) for incoming-only components added during lane operations.
//! Validates relative destination roots and rejects workspace-root (`.`) additions.

#[cfg(test)]
mod tests;

use super::{Captured, comparison, invalid};
use serde_json::{Value, json};
use std::io;

/// An incoming-only component has no current `Consumer` contents or version.
/// Its destination is prepared from canonical workspace directory configuration.
pub(in crate::workspace::engine::command) fn capture(
    identity: &str,
    destination: &Value,
) -> io::Result<Captured> {
    let identity = identity.trim();
    validate_addition_identity(identity, destination)?;
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

/// Validates that `identity` matches `<scope>/<name>` in `destination` without control characters, backslashes, or `..` segments (within `1,024` bytes) for [`capture`].
#[inline]
fn validate_addition_identity(identity: &str, destination: &Value) -> io::Result<()> {
    let scope = destination["scope"]
        .as_str()
        .map(str::trim)
        .ok_or_else(|| invalid("lane addition scope"))?;
    let name = destination["name"]
        .as_str()
        .map(str::trim)
        .ok_or_else(|| invalid("lane addition name"))?;
    let bad_scope = scope.is_empty() || scope.contains('/') || matches!(scope, "." | "..");
    if bad_scope
        || name.is_empty()
        || identity.len() > 1024
        || identity
            .strip_prefix(scope)
            .and_then(|rest| rest.strip_prefix('/'))
            != Some(name)
        || identity
            .chars()
            .any(|ch| ch == '\\' || ch.is_control())
        || name
            .split('/')
            .any(|part| part.is_empty() || matches!(part, "." | ".."))
    {
        return Err(invalid("lane addition identity"));
    }
    Ok(())
}
