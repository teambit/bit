//! Installed package manifest metadata resolution via [`resolved`] for dependency policy.

use super::{Value, invalid, io, json};

/// Resolves installed package identity and concrete version metadata from `package` and `dependent`.
pub(super) fn resolved(
    name: &str,
    package: Option<&Value>,
    dependent: Option<&Value>,
) -> io::Result<Option<Value>> {
    let fallback = dependent.is_some_and(|value| {
        ["dependencies", "devDependencies", "peerDependencies"]
            .iter()
            .any(|field| truthy(&value[field]["packageName"]))
    });
    let Some(package) = package.filter(|value| truthy(&value["name"])) else {
        return Ok(fallback.then(
            || json!({"name":name,"componentIdentity":null,"concreteVersion":null}),
        ));
    };
    let name = package["name"]
        .as_str()
        .map(str::trim)
        .filter(|name| !name.is_empty())
        .ok_or_else(|| invalid("dependency package name"))?;
    let mut concrete = optional_string(package.get("version"))?;
    let identity = if let Some(id) = package.get("componentId").filter(|value| truthy(value)) {
        let (identity, version) = identity(id)?;
        if concrete.is_some_and(|version| !version.is_empty())
            && version.is_some_and(concrete_version)
        {
            concrete = version;
        }
        Some(identity)
    } else {
        None
    };
    Ok(Some(json!({"name":name,"componentIdentity":identity,"concreteVersion":concrete})))
}
/// Parses a package `componentId` `value` into a formatted component identity and optional version.
fn identity(value: &Value) -> io::Result<(String, Option<&str>)> {
    let (scope, name, version) = if let Some(raw) = value.as_str().map(str::trim) {
        let (bare, version) = raw
            .rsplit_once('@')
            .map_or((raw, None), |(bare, ver)| (bare.trim(), Some(ver.trim())));
        let (scope, name) = bare
            .split_once('/')
            .map(|(scope, name)| (scope.trim(), name.trim()))
            .filter(|(scope, name)| !scope.is_empty() && !scope.contains('/') && !name.is_empty())
            .ok_or_else(|| invalid("package component scope"))?;
        (scope, name, version)
    } else {
        let name = value["name"]
            .as_str()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .ok_or_else(|| invalid("package component name"))?;
        let scope = value["scope"]
            .as_str()
            .map(str::trim)
            .filter(|value| !value.is_empty() && !value.contains('/'))
            .ok_or_else(|| invalid("package component scope"))?;
        (scope, name, optional_string(value.get("version"))?)
    };
    let formatted = match version.filter(|ver| concrete_version(ver)) {
        Some(ver) => format!("{scope}/{name}@{ver}"),
        None => format!("{scope}/{name}"),
    };
    Ok((formatted, version))
}
/// Returns `true` when `version` is a non-empty concrete version string (neither `"latest"` nor `"head"`).
#[inline]
fn concrete_version(version: &str) -> bool {
    let version = version.trim();
    !version.is_empty()
        && !version.eq_ignore_ascii_case("latest")
        && !version.eq_ignore_ascii_case("head")
}
/// Extracts an optional trimmed string from `value`, rejecting non-string non-null JSON values.
#[inline]
fn optional_string(value: Option<&Value>) -> io::Result<Option<&str>> {
    match value {
        None | Some(Value::Null) => Ok(None),
        Some(Value::String(value)) => Ok(Some(value.trim())),
        _ => Err(invalid("dependency package version")),
    }
}
#[inline]
fn truthy(value: &Value) -> bool {
    match value {
        Value::Null => false,
        Value::Bool(value) => *value,
        Value::Number(value) => value
            .as_f64()
            .is_some_and(|number| number != 0.0 && !number.is_nan()),
        Value::String(value) => !value.trim().is_empty(),
        Value::Object(_) | Value::Array(_) => true,
    }
}
