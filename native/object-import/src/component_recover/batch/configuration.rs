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
    extensions.retain(|key, _| {
        let trimmed = key.trim();
        trimmed != REMOVE && !trimmed.starts_with("teambit.component/remove@")
    });
    extensions.insert(REMOVE.into(), serde_json::json!({"removed":false}));
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
