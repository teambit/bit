//! The dependency loader's `package.json` `bit.peer` component policy [`range`] and [`truthy`] for [`Package`].

use super::Package;
use serde_json::{Value, json};

/// Computes the `bit.peer` and `bit.defaultPeerRange` peer version range for `package` using [`truthy`].
#[inline]
pub(super) fn range(package: &Package) -> Option<Value> {
    if !truthy(&package.manifest["bit"]["peer"]) {
        return None;
    }
    let range = &package.manifest["bit"]["defaultPeerRange"];
    if !truthy(range) {
        return Some(json!("*"));
    }
    let Some(prefix @ ("~" | "^" | ">=")) = range.as_str().map(str::trim) else {
        return Some(
            range
                .as_str()
                .map(str::trim)
                .filter(|text| !text.is_empty())
                .map_or_else(|| json!("*"), |text| json!(text)),
        );
    };
    let concrete = package.concrete
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or("undefined");
    let formatted =
        if node_semver::Version::parse(concrete).is_ok() || concrete.starts_with("0.0.0-") {
            format!("{prefix}{concrete}")
        } else {
            format!("{prefix}0.0.0-{concrete}")
        };
    Some(Value::String(formatted))
}

/// Returns `true` when `value` is truthy under `JavaScript` boolean coercion rules.
#[inline]
fn truthy(value: &Value) -> bool {
    match value {
        Value::Null => false,
        Value::Bool(value) => *value,
        Value::Number(value) => value
            .as_f64()
            .is_some_and(|number| number != 0.0 && !number.is_nan()),
        Value::String(value) => !value.trim().is_empty(),
        _ => true,
    }
}
