//! `BitId.serialize` followed by `ComponentID.toObject` preserves legacy default-scope order.
#[cfg(test)]
mod tests;

use super::invalid;
use serde_json::{Map, Value};
use std::io;

pub(super) fn serialize(raw: &Value, unscoped: bool) -> io::Result<Value> {
    let (scope, name, version) = if let Some(text) = raw.as_str().map(str::trim) {
        let (bare, ver) = text
            .rsplit_once('@')
            .map_or((text, None), |(bare, ver)| (bare.trim(), Some(ver.trim())));
        let (scope, name) = bare
            .split_once('/')
            .map(|(scope, name)| (scope.trim(), name.trim()))
            .filter(|(scope, name)| !scope.is_empty() && !name.is_empty())
            .ok_or_else(|| invalid("fresh component scope"))?;
        (scope, name, ver)
    } else {
        let name = raw["name"]
            .as_str()
            .map(str::trim)
            .filter(|name| !name.is_empty())
            .ok_or_else(|| invalid("fresh component name"))?;
        let scope = raw["scope"]
            .as_str()
            .map(str::trim)
            .filter(|scope| !scope.is_empty())
            .ok_or_else(|| invalid("fresh component scope"))?;
        (scope, name, raw["version"].as_str().map(str::trim))
    };
    let mut id = Map::new();
    if !unscoped {
        id.insert("scope".into(), Value::String(scope.into()));
    }
    id.insert("name".into(), Value::String(name.into()));
    if let Some(version) =
        version.filter(|version| !version.is_empty() && !matches!(*version, "latest" | "head"))
    {
        id.insert("version".into(), Value::String(version.into()));
    }
    if unscoped {
        id.insert("scope".into(), Value::String(scope.into()));
    }
    Ok(Value::Object(id))
}
pub(super) fn set_version(id: &mut Map<String, Value>, version: String) {
    // Projection already applied the actual legacy scoped/default-scope constructor.
    // A name-first ID has its default scope appended after legacy serialization.
    let scope = if id
        .keys()
        .next()
        .is_some_and(|key| key == "name")
    {
        id.shift_remove("scope")
    } else {
        None
    };
    id.insert("version".into(), Value::String(version));
    if let Some(scope) = scope {
        id.insert("scope".into(), scope);
    }
}
