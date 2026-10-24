pub(crate) use conflict::Conflict;

mod component;
mod conflict;
mod scope;
mod semver;
mod updates;
mod validate;
mod workspace;

use serde_json::Value;
use std::io;

pub(crate) fn apply(kind: &str, input: &Value) -> io::Result<Value> {
    if kind == "configScopePolicy" {
        return scope::plan(input);
    }
    let fields = match kind {
        "configComponent" => &[
            "compIdStr",
            "current",
            "base",
            "other",
            "coreNames",
            "workspaceIds",
            "otherLaneIds",
            "strategy",
            "currentLabel",
            "otherLabel",
            "semver",
            "shouldMergeAspectsData",
        ][..],
        "configWorkspaceUpdates" => {
            &["workspaceEntries", "componentDeps", "strategy", "semver"][..]
        }
        "configWorkspaceMerge" => &["records", "policy", "semver"][..],
        _ => return Err(invalid("config kind")),
    };
    validate::fields(input, fields)?;
    validate::semver(&input["semver"])?;
    match kind {
        "configWorkspaceUpdates" => updates::plan(input),
        "configWorkspaceMerge" => workspace::plan(input),
        "configComponent" => {
            validate::component(input)?;
            component::plan(input)
        }
        _ => Err(invalid("unsupported config operation")),
    }
}
fn invalid(message: &str) -> io::Error {
    io::Error::new(io::ErrorKind::InvalidData, message)
}
fn truthy(value: &Value) -> bool {
    match value {
        Value::Null => false,
        Value::Bool(value) => *value,
        Value::Number(value) => value.as_f64() != Some(0.0),
        Value::String(value) => !value.is_empty(),
        _ => true,
    }
}
pub(crate) fn conflict_plan(input: &Value) -> io::Result<(Value, Conflict)> {
    validate::fields(input, &["path", "fallbackPath", "conflicts"])?;
    conflict::plan(input)
}
pub(crate) fn conflict_commit(input: &Value, state: &mut Option<Conflict>) -> io::Result<Value> {
    validate::fields(input, &["token", "path"])?;
    conflict::commit(input, state)
}
pub(crate) fn render_workspace_conflict(contents: &str, conflicts: &Value) -> io::Result<String> {
    conflict::render(contents, conflicts)
}
fn text<'a>(input: &'a Value, field: &str) -> io::Result<&'a str> {
    input[field]
        .as_str()
        .filter(|value| value.len() <= 4096)
        .ok_or_else(|| invalid("config text"))
}
fn array<'a>(input: &'a Value, field: &str) -> io::Result<&'a [Value]> {
    input[field]
        .as_array()
        .filter(|values| values.len() <= 4096)
        .map(Vec::as_slice)
        .ok_or_else(|| invalid("config array"))
}
#[cfg(test)]
mod tests;

pub(crate) fn compare_versions(left: &Value, right: &Value) -> io::Result<std::cmp::Ordering> {
    semver::compare(left, right)
}
