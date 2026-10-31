//! List the default scope through native inbound transport before checkout preparation.
use super::{NodeCli, Request, array};
use crate::commands::{engine::Engine, status::cache::cache_root};
use serde_json::{Value, json};
use std::{io, path::Path};

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

fn default_workspace_scope(workspace: &Value) -> Option<&str> {
    crate::commands::update_cmd::aspect_entry(workspace, "teambit.workspace/workspace")
        .and_then(|(_, config)| config["defaultScope"].as_str())
        .or_else(|| workspace["defaultScope"].as_str())
        .map(str::trim)
        .filter(|scope| !scope.is_empty())
}

fn list(engine: &mut Engine, root: &Path, scope: &str) -> io::Result<Vec<Value>> {
    let cli = NodeCli::find()?;
    let listed: Value = engine.request(&json!({
        "kind": "commandInboundList",
        "root": root,
        "globalConfigDir": cache_root().join("config"),
        "nodeExecutable": cli.node,
        "bitDir": cli.bit_dir,
        "bitVersion": cli.version,
        "patterns": [format!("{}/**", scope.trim())],
        "laneOnly": false,
    }))?;
    let first = listed["lists"]
        .get(0)
        .and_then(|entry| entry.get("components"));
    Ok(array(first, "checkout scope components")?
        .iter()
        .filter_map(|component| match &component["id"] {
            Value::Null => None,
            Value::String(text) => {
                let trimmed = text.trim();
                (!trimmed.is_empty()).then(|| Value::String(trimmed.to_owned()))
            }
            other => Some(other.clone()),
        })
        .collect())
}
