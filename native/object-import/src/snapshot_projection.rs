pub use semantic::{Semantic, semantic};

#[path = "snapshot_projection/artifacts.rs"]
mod artifacts;
#[path = "snapshot_projection/models.rs"]
mod models;
#[path = "snapshot_projection/semantic.rs"]
mod semantic;

#[path = "snapshot_projection/version.rs"]
mod version;

use sha1::{Digest, Sha1};
use std::io;

use crate::js_json::{Value, stringify};

/// Project raw default-class fields without calling JavaScript serializers.
pub fn project(kind: &str, fields: &Value) -> io::Result<Value> {
    object(fields)?;
    match kind {
        "Version" => version::project(fields),
        "Component" => models::component(fields),
        "Lane" => models::lane(fields),
        "VersionHistory" => models::history(fields),
        "LaneHistory" => choose(fields, &["name", "scope", "laneHash", "history"], false),
        _ => Err(invalid("unsupported snapshot metadata type")),
    }
}

pub fn identity(kind: &str, fields: &Value, allocated: Option<&str>) -> io::Result<String> {
    object(fields)?;
    if kind == "LaneHistory" {
        return lane_history_identity(fields);
    }
    if matches!(kind, "Version" | "Lane") {
        let hash = allocated.map(str::trim).ok_or_else(|| invalid("preallocated hash missing"))?;
        if !is_sha1_hex(hash) {
            return Err(invalid("invalid preallocated hash"));
        }
        return Ok(hash.to_owned());
    }
    let name = text(get(fields, "name"))?;
    if name.trim().is_empty() {
        return Err(invalid("snapshot empty component name"));
    }
    let scope = get(fields, "scope");
    let scoped = if scope.truthy()? { format!("{}/{name}", text(scope)?) } else { name.clone() };
    let id = match kind {
        "Component" => scoped,
        "VersionHistory" => {
            let scope_text = text(scope)?;
            if scope_text.trim().is_empty() {
                return Err(invalid("snapshot empty history scope"));
            }
            format!("{scope_text}/{name}:VersionHistory")
        }
        _ => return Err(invalid("unsupported object identity")),
    };
    Ok(hexadecimal(&Sha1::digest(id.as_bytes())))
}

fn lane_history_identity(fields: &Value) -> io::Result<String> {
    let lane_hash = text(get(fields, "laneHash"))?;
    let trimmed = lane_hash.trim();
    if !is_sha1_hex(trimmed) {
        return Err(invalid("invalid laneHash"));
    }
    let id = format!("{trimmed}:LaneHistory");
    Ok(hexadecimal(&Sha1::digest(id.as_bytes())))
}

pub fn serialize(kind: &str, fields: &Value, pretty: bool) -> io::Result<Vec<u8>> {
    stringify(&project(kind, fields)?, pretty)?.ok_or_else(|| invalid("missing serialization"))
}

fn get<'a>(fields: &'a Value, name: &str) -> &'a Value {
    static UNDEFINED: Value = Value::Undefined;
    let Value::Object(fields) = fields else {
        return &UNDEFINED;
    };
    fields
        .iter()
        .find(|(key, _)| {
            key.iter()
                .copied()
                .eq(name.encode_utf16())
        })
        .map_or(&UNDEFINED, |(_, value)| value)
}

fn object(fields: &Value) -> io::Result<&[(Vec<u16>, Value)]> {
    let Value::Object(fields) = fields else {
        return Err(invalid("snapshot object fields required"));
    };
    let mut seen = std::collections::HashSet::new();
    if fields
        .iter()
        .any(|(key, _)| !seen.insert(key))
    {
        return Err(invalid("duplicate snapshot field"));
    }
    Ok(fields)
}

fn choose(fields: &Value, names: &[&str], truthy: bool) -> io::Result<Value> {
    let mut selected = Vec::new();
    for &name in names {
        let value = get(fields, name);
        if !truthy || value.truthy()? {
            selected.push((name.encode_utf16().collect(), value.clone()));
        }
    }
    Ok(Value::Object(selected))
}

fn insert(fields: &mut Value, name: &str, value: Value) {
    let Value::Object(fields) = fields else {
        unreachable!("created object");
    };
    fields.push((name.encode_utf16().collect(), value));
}

fn text(value: &Value) -> io::Result<String> {
    let Value::String(units) = value else {
        return Err(invalid("snapshot string required"));
    };
    Ok(String::from_utf16_lossy(units))
}

fn hexadecimal(bytes: &[u8]) -> String {
    const DIGITS: &[u8; 16] = b"0123456789abcdef";
    let mut text = String::with_capacity(bytes.len() * 2);
    for &byte in bytes {
        text.push(char::from(DIGITS[usize::from(byte >> 4)]));
        text.push(char::from(DIGITS[usize::from(byte & 15)]));
    }
    text
}

fn is_sha1_hex(hash: &str) -> bool {
    hash.len() == 40
        && hash
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
}

fn invalid(message: &str) -> io::Error {
    io::Error::new(io::ErrorKind::InvalidData, message)
}
