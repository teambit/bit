//! The dependency loader's package.json bit.peer component policy.

use super::Package;
use serde_json::{Value, json};

pub(super) fn range(package: &Package) -> Option<Value> {
    if !truthy(&package.manifest["bit"]["peer"]) {
        return None;
    }
    let range = &package.manifest["bit"]["defaultPeerRange"];
    if !truthy(range) {
        return Some(json!("*"));
    }
    let Some(prefix @ ("~" | "^" | ">=")) = range.as_str().map(str::trim) else {
        return Some(range.clone());
    };
    let concrete = package.concrete
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or("undefined");
    let version = if node_semver::Version::parse(concrete).is_ok() || concrete.starts_with("0.0.0-")
    {
        concrete.to_owned()
    } else {
        format!("0.0.0-{concrete}")
    };
    Some(json!(format!("{prefix}{version}")))
}

fn truthy(value: &Value) -> bool {
    match value {
        Value::Null => false,
        Value::Bool(value) => *value,
        Value::Number(value) => value
            .as_f64()
            .is_some_and(|number| number != 0.0),
        Value::String(value) => !value.trim().is_empty(),
        _ => true,
    }
}
