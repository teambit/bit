//! List the default scope through native inbound transport before checkout preparation.
//!
//! [`candidates`], [`list`], and [`default_workspace_scope`] query [`Engine`] and [`NodeCli`] for remote scope candidates on [`Request`].
use super::{NodeCli, Request, decline};
use crate::commands::{engine::Engine, status::cache::cache_root};
use serde_json::{Value, json};
use std::{io, path::Path};

/// Lists remote scope candidates for `checkout --include-new-from-scope` on `request` ([`Request`]) via `engine` ([`Engine`]).
#[inline]
pub(super) fn candidates(
    engine: &mut Engine,
    root: &Path,
    home: &Path,
    request: &Request<'_>,
) -> io::Result<Vec<Value>> {
    if request.operation != "checkout" || request.options["includeNewFromScope"] != true {
        return Ok(Vec::new());
    }
    let context: Value =
        engine.request(&json!({"kind":"statusContext","root":root,"home":home,"history":false}))?;
    let Some(scope) = default_workspace_scope(&context["workspace"]) else {
        return Ok(Vec::new());
    };
    // Node logs listing failures to its file logger and continues normal checkout.
    Ok(list(engine, root, scope).unwrap_or_default())
}

/// Extracts the non-empty `defaultScope` string from a `workspace.jsonc` [`Value`].
#[inline]
fn default_workspace_scope(workspace: &Value) -> Option<&str> {
    crate::commands::update_cmd::aspect_entry(workspace, "teambit.workspace/workspace")
        .and_then(|(_, config)| config["defaultScope"].as_str())
        .or_else(|| workspace["defaultScope"].as_str())
        .map(str::trim)
        .filter(|scope| !scope.is_empty())
}

/// Invokes `commandInboundList` on `engine` ([`Engine`], [`NodeCli`]) at `root` ([`Path`]) for `scope/**` and returns the non-empty component IDs.
fn list(engine: &mut Engine, root: &Path, scope: &str) -> io::Result<Vec<Value>> {
    let cli = NodeCli::find()?;
    let listed: Value = engine.request(&json!({
        "kind": "commandInboundList",
        "root": root,
        "globalConfigDir": cache_root().join("config"),
        "nodeExecutable": cli.node,
        "bitDir": cli.bit_dir,
        "bitVersion": cli.version.trim(),
        "patterns": [format!("{}/**", scope.trim())],
        "laneOnly": false,
    }))?;
    let mut listed = listed;
    let components = listed["lists"]
        .get_mut(0)
        .and_then(|entry| entry.get_mut("components"))
        .and_then(Value::as_array_mut)
        .ok_or_else(|| decline("checkout scope components"))?;
    Ok(std::mem::take(components)
        .into_iter()
        .filter_map(|mut component| match component["id"].take() {
            Value::Null => None,
            Value::String(text) => {
                let trimmed = text.trim();
                if trimmed.is_empty() {
                    None
                } else if trimmed.len() == text.len() {
                    Some(Value::String(text))
                } else {
                    Some(Value::String(trimmed.to_owned()))
                }
            }
            other => Some(other),
        })
        .collect())
}
