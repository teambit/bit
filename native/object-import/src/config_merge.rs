//! Three-way aspect configuration ([`component`]), dependency-resolver, and workspace-policy merge engine ([`apply`]).

pub(crate) use conflict::Conflict;

mod component;
mod conflict;
mod scope;
mod semver;
#[cfg(test)]
mod tests;
mod updates;
mod validate;
mod workspace;

use serde_json::Value;
use std::io;

/// Dispatches a `config-merge` operation (`kind`) on validated JSON `input` [`Value`].
pub(crate) fn apply(kind: &str, input: &Value) -> io::Result<Value> {
    let kind = kind.trim();
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
        _ => {
            validate::component(input)?;
            component::plan(input)
        }
    }
}
/// Construct an [`io::ErrorKind::InvalidData`] error with `message`.
#[inline]
fn invalid(message: &str) -> io::Error {
    io::Error::new(io::ErrorKind::InvalidData, message)
}
/// Return `true` when JSON `value` is JavaScript-truthy (`true`, non-zero number, non-empty string, or object/array).
#[inline]
fn truthy(value: &Value) -> bool {
    match value {
        Value::Null => false,
        Value::Bool(value) => *value,
        Value::Number(value) => value
            .as_f64()
            .is_some_and(|num| num != 0.0 && !num.is_nan()),
        Value::String(value) => !value.trim().is_empty(),
        _ => true,
    }
}
/// Validate `input` and prepare a `config-merge` [`Conflict`] plan and response payload.
#[inline]
pub(crate) fn conflict_plan(input: &Value) -> io::Result<(Value, Conflict)> {
    validate::fields(input, &["path", "fallbackPath", "conflicts"])?;
    validate::fields(
        &input["conflicts"],
        &["dependencies", "devDependencies", "peerDependencies"],
    )?;
    conflict::plan(input)
}
/// Validate `input` and commit a previously prepared `config-merge` [`Conflict`] `state`.
#[inline]
pub(crate) fn conflict_commit(input: &Value, state: &mut Option<Conflict>) -> io::Result<Value> {
    validate::fields(input, &["token", "path"])?;
    conflict::commit(input, state)
}
/// Render `workspace.jsonc` dependency conflict markers into `contents` from `conflicts` via [`conflict::render`].
#[inline]
pub(crate) fn render_workspace_conflict(contents: &str, conflicts: &Value) -> io::Result<String> {
    if contents.len() > 32 * 1024 * 1024 || contents.as_bytes().contains(&0) {
        return Err(invalid("conflict workspace contents"));
    }
    validate::fields(conflicts, &["dependencies", "devDependencies", "peerDependencies"])?;
    conflict::render(contents, conflicts)
}
#[inline]
fn text<'a>(input: &'a Value, field: &str) -> io::Result<&'a str> {
    input[field]
        .as_str()
        .filter(|value| value.len() <= 4096 && !value.as_bytes().contains(&0))
        .ok_or_else(|| invalid("config text"))
}
#[inline]
fn array<'a>(input: &'a Value, field: &str) -> io::Result<&'a [Value]> {
    input[field]
        .as_array()
        .filter(|values| values.len() <= 4096)
        .map(Vec::as_slice)
        .ok_or_else(|| invalid("config array"))
}

#[inline]
pub(crate) fn compare_versions(left: &Value, right: &Value) -> io::Result<std::cmp::Ordering> {
    semver::compare(left, right)
}
