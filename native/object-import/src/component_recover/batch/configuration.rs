//! `ComponentConfigFile` replaces the remove aspect and preserves detected JSON formatting.
use super::{Action, Batch, Configuration, Item, REMOVE, Value, invalid, selection};
use bit_workspace_config::package_json::{detect_indent, detect_newline, stringify_package};
use std::io;

pub(super) fn prepare(batch: &mut Batch, item: &Item) -> io::Result<Option<Configuration>> {
    if !matches!(item.action, Action::Import | Action::UpdateConfig) {
        return Ok(None);
    }
    let Some(key) = selection::key(&batch.bitmap, &item.id)? else { return Ok(None) };
    let row = &batch.bitmap[&key];
    let directory = row["rootDir"].as_str().ok_or_else(|| invalid("recovery component root"))?;
    if directory != "." {
        crate::checkout::plan::relative_path(directory)?;
    }
    let path = batch.root.join(directory).join("component.json");
    super::publication::existing_ancestors(batch, &path)?;
    let Some(before) = batch.proofs.read(&path)? else { return Ok(None) };
    let text = std::str::from_utf8(&before).map_err(io::Error::other)?;
    let parsed: Value = serde_json::from_slice(&before).map_err(io::Error::other)?;
    let value = projection(&parsed)?;
    let bytes = stringify_package(&value, &detect_indent(text), detect_newline(text))?.into_bytes();
    Ok(Some(Configuration { path, bytes }))
}
fn projection(parsed: &Value) -> io::Result<Value> {
    if parsed["componentId"]["scope"].as_str().is_none_or(str::is_empty) {
        return Err(invalid("recovery component.json requires a scoped componentId"));
    }
    let mut extensions = parsed["extensions"]
        .as_object()
        .cloned()
        .unwrap_or_default();
    extensions.insert(REMOVE.into(), serde_json::json!({"removed":false}));
    let mut value = serde_json::json!({
        "componentId":parsed["componentId"],
        "propagate":parsed["propagate"] == true,
    });
    if let Some(default_scope) = parsed.get("defaultScope") {
        value["defaultScope"] = default_scope.clone();
    }
    value["extensions"] = Value::Object(extensions);
    Ok(value)
}
