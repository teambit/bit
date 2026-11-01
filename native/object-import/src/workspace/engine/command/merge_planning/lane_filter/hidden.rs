use super::{Value, invalid, json};
use crate::workspace::engine::command::capture::Captured;
use std::io;
pub(in crate::workspace::engine::command::merge_planning) fn prepare_hidden_metadata(
    current: &Captured,
    output: &mut Value,
) -> io::Result<()> {
    if !current.target.directory.trim().is_empty() {
        return Err(invalid("hidden bitmap component requires scope reload projection"));
    }
    let resolver = resolver_dependencies(output).cloned();
    for field in ["dependencies", "devDependencies"] {
        let dependencies =
            output[field].as_array_mut().ok_or_else(|| invalid("hidden dependency list"))?;
        for dependency in dependencies {
            package_name(dependency, resolver.as_deref());
        }
    }
    Ok(())
}

fn package_name(dependency: &mut Value, resolver: Option<&[Value]>) {
    if dependency
        .get("packageName")
        .and_then(Value::as_str)
        .is_some_and(|name| !name.trim().is_empty())
    {
        return;
    }
    if let Some(name) = resolver
        .and_then(|rows| {
            rows.iter()
                .find(|row| {
                    row["__type"].as_str().map(str::trim) == Some("component")
                        && same_component_id(&row["componentId"], &dependency["id"])
                })
        })
        .and_then(|row| row["packageName"].as_str())
        .map(str::trim)
        .filter(|name| !name.is_empty())
    {
        dependency["packageName"] = json!(name);
    }
}

fn same_component_id(left: &Value, right: &Value) -> bool {
    left == right
        || component_id_key(left).is_some_and(|left_key| Some(left_key) == component_id_key(right))
}

fn component_id_key(value: &Value) -> Option<(&str, &str, &str)> {
    if let Some(raw) = value.as_str().map(str::trim) {
        let (bare, version) = raw
            .rsplit_once('@')
            .map_or((raw, ""), |(b, v)| (b.trim(), v.trim()));
        let (scope, name) = bare.split_once('/')?;
        return Some((scope.trim(), name.trim(), version));
    }
    let scope = value["scope"].as_str()?.trim();
    let name = value["name"].as_str()?.trim();
    let version = value["version"].as_str().map_or("", str::trim);
    (!scope.is_empty() && !name.is_empty()).then_some((scope, name, version))
}

#[inline]
fn resolver_dependencies(output: &Value) -> Option<&Vec<Value>> {
    output["extensions"]
        .as_array()?
        .iter()
        .find(|row| {
            crate::workspace::engine::client_status::config::is_extension_aspect(
                row,
                "teambit.dependencies/dependency-resolver",
            )
        })?["data"]["dependencies"]
        .as_array()
}
