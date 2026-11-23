//! `ComponentConfigFile` replacement ([`prepare`], [`projection`]) of the [`REMOVE`] aspect while preserving JSON indentation and newlines.
use super::{Action, Batch, Configuration, Item, REMOVE, Value, invalid, selection};
use bit_workspace_config::package_json::{detect_indent, detect_newline, stringify_package};
use std::io;

/// Prepares a [`Configuration`] edit for `component.json` on [`Batch`] and [`Item`] removing the [`REMOVE`] aspect while preserving formatting.
pub(super) fn prepare(batch: &mut Batch, item: &Item) -> io::Result<Option<Configuration>> {
    if !matches!(item.action, Action::Import | Action::UpdateConfig) {
        return Ok(None);
    }
    let Some(key) = selection::key(&batch.bitmap, &item.id)? else { return Ok(None) };
    let row = &batch.bitmap[&key];
    let directory = row["rootDir"]
        .as_str()
        .map(str::trim)
        .filter(|dir| !dir.is_empty())
        .ok_or_else(|| invalid("recovery component root"))?;
    if directory != "." {
        crate::checkout::plan::relative_path(directory)?;
    }
    let path = batch.root.join(directory).join("component.json");
    super::publication::existing_ancestors(batch, &path)?;
    let Some(before) = batch.proofs.read(&path)? else { return Ok(None) };
    let text = std::str::from_utf8(&before).map_err(io::Error::other)?;
    let parsed: Value = crate::parse_jsonc(&before)?;
    let value = projection(parsed)?;
    let bytes = stringify_package(&value, &detect_indent(text), detect_newline(text))?.into_bytes();
    Ok(Some(Configuration { path, bytes }))
}
/// Project `parsed` `component.json` with [`REMOVE`] set to `{"removed": false}`.
fn projection(mut parsed: Value) -> io::Result<Value> {
    if !parsed.is_object() {
        return Err(invalid("recovery component.json must be an object"));
    }
    if !has_scoped_component_id(&parsed) {
        return Err(invalid("recovery component.json requires a scoped componentId"));
    }
    let mut extensions = parsed["extensions"]
        .as_object_mut()
        .map(std::mem::take)
        .unwrap_or_default();
    extensions = replace_removal(extensions);
    let propagate = parsed["propagate"] == true;
    let component_id = parsed["componentId"].take();
    let mut value = serde_json::json!({
        "componentId":component_id,
        "propagate":propagate,
    });
    if let Some(default_scope) = parsed.get_mut("defaultScope").map(Value::take) {
        value["defaultScope"] = default_scope;
    }
    value["extensions"] = Value::Object(extensions);
    Ok(value)
}

/// Replace the removal aspect in place (keeping its key position) with `{"removed": false}`.
fn replace_removal(extensions: serde_json::Map<String, Value>) -> serde_json::Map<String, Value> {
    let is_removal = |key: &str| {
        let trimmed = key.trim();
        trimmed == REMOVE || trimmed.starts_with("teambit.component/remove@")
    };
    let mut replaced = serde_json::Map::new();
    for (key, value) in extensions {
        if !is_removal(&key) {
            replaced.insert(key, value);
        } else if !replaced.contains_key(REMOVE) {
            replaced.insert(REMOVE.into(), serde_json::json!({"removed":false}));
        }
    }
    if !replaced.contains_key(REMOVE) {
        replaced.insert(REMOVE.into(), serde_json::json!({"removed":false}));
    }
    replaced
}

/// Return `true` when `parsed` `component.json` defines a scoped `componentId` or `defaultScope`.
#[inline]
fn has_scoped_component_id(parsed: &Value) -> bool {
    let str_scoped = parsed["componentId"]
        .as_str()
        .map(str::trim)
        .and_then(|raw| {
            raw.rsplit_once('@')
                .map_or(raw, |(bare, _)| bare.trim())
                .split_once('/')
        })
        .is_some_and(|(scope, name)| !scope.trim().is_empty() && !name.trim().is_empty());
    let obj_scoped = parsed["componentId"]["name"]
        .as_str()
        .is_some_and(|val| !val.trim().is_empty())
        && (parsed["componentId"]["scope"]
            .as_str()
            .is_some_and(|val| !val.trim().is_empty())
            || parsed["defaultScope"]
                .as_str()
                .is_some_and(|val| !val.trim().is_empty()));
    str_scoped || obj_scoped
}
