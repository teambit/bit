//! `BitId.serialize` followed by `ComponentID.toObject` preserves legacy default-scope order.
use super::invalid;
use serde_json::{Map, Value};
use std::io;

pub(super) fn serialize(raw: &Value, unscoped: bool) -> io::Result<Value> {
    let name = raw["name"].as_str().ok_or_else(|| invalid("fresh component name"))?;
    let scope = raw["scope"]
        .as_str()
        .filter(|scope| !scope.is_empty())
        .ok_or_else(|| invalid("fresh component scope"))?;
    let mut id = Map::new();
    if !unscoped {
        id.insert("scope".into(), Value::String(scope.into()));
    }
    id.insert("name".into(), Value::String(name.into()));
    if let Some(version) = raw["version"]
        .as_str()
        .filter(|version| !version.is_empty() && *version != "latest")
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

#[cfg(test)]
mod tests;
