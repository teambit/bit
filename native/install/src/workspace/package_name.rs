//! `componentIdToPackageName`.

use crate::model::ComponentId;
use serde_json::{Map, Value};

const PKG_ASPECT: &str = "teambit.pkg/pkg";

/// `getBindingPrefixByDefaultScope`: `@<owner>`, the part of the scope before the first dot.
#[must_use]
pub fn binding_prefix_by_default_scope(scope: &str) -> String {
    let trimmed = scope.trim();
    let owner = trimmed
        .split('.')
        .next()
        .filter(|part| !part.is_empty())
        .unwrap_or("undefined");
    format!("@{owner}")
}

/// `parseScope`: `owner.scope` → (owner, scope).
fn parse_scope(scope_id: Option<&str>) -> (Option<&str>, Option<&str>) {
    match scope_id
        .map(str::trim)
        .filter(|scope_id| !scope_id.is_empty())
    {
        Some(scope_id) if scope_id.contains('.') => {
            let mut parts = scope_id.split('.');
            let owner = parts
                .next()
                .map(str::trim)
                .filter(|part| !part.is_empty());
            let scope = parts
                .next()
                .map(str::trim)
                .filter(|part| !part.is_empty());
            (owner, scope)
        }
        Some(scope_id) => (None, Some(scope_id)),
        None => (None, None),
    }
}

/// The package name of a component: `teambit.pkg/pkg` `packageJson.name` when
/// configured (with `{name}`, `{scope}`, `{scopeId}`, `{owner}` and `{main}`
/// placeholders), otherwise `<binding prefix>/<scope>.<name with dots>` with
/// the owner removed from the scope part.
#[must_use]
pub fn component_package_name(
    id: &ComponentId,
    binding_prefix: Option<&str>,
    aspects: &Map<String, Value>,
) -> String {
    let scope = id.effective_scope();
    let configured = aspects
        .iter()
        .find(|(key, _)| crate::config::aspect_id_without_version(key) == PKG_ASPECT)
        .and_then(|(_, config)| {
            config
                .get("packageJson")?
                .get("name")?
                .as_str()
                .map(str::trim)
        });
    if let Some(template) = configured.filter(|template| !template.is_empty()) {
        let (owner, scope_name) = parse_scope(scope);
        return fill_placeholders(template, &id.name, scope_name, scope, owner);
    }
    let name = id.name.trim().replace('/', ".");
    let mut without_prefix = format!("{}.{name}", scope.unwrap_or("undefined"));
    let prefix = binding_prefix
        .map(str::trim)
        .filter(|prefix| !prefix.is_empty())
        .map_or_else(
            || binding_prefix_by_default_scope(scope.unwrap_or("undefined")),
            str::to_owned,
        );
    let owner_prefix = format!("{prefix}.").replacen('@', "", 1);
    if prefix != "@bit"
        && let Some(rest) = without_prefix.strip_prefix(&owner_prefix)
    {
        without_prefix = rest.to_owned();
    }
    format!("{prefix}/{without_prefix}")
}

/// `replacePlaceHolderForPackageValue` (string-format): `{{`/`}}` escape braces;
/// an unknown placeholder renders empty, a missing value as `undefined`.
fn fill_placeholders(
    template: &str,
    name: &str,
    scope: Option<&str>,
    scope_id: Option<&str>,
    owner: Option<&str>,
) -> String {
    let mut output = String::with_capacity(template.len());
    let mut rest = template;
    while let Some(open) = rest.find(['{', '}']) {
        output.push_str(&rest[..open]);
        let tail = &rest[open..];
        if tail.starts_with("{{") || tail.starts_with("}}") {
            output.push_str(&tail[..1]);
            rest = &tail[2..];
            continue;
        }
        let Some(close) = tail
            .find('}')
            .filter(|_| tail.starts_with('{'))
        else {
            output.push_str(&tail[..1]);
            rest = &tail[1..];
            continue;
        };
        let value = match &tail[1..close] {
            "name" => Some(name.replace('/', ".")),
            "scope" => Some(scope.unwrap_or("undefined").to_owned()),
            "scopeId" => Some(scope_id.unwrap_or("undefined").to_owned()),
            "owner" => Some(owner.unwrap_or("undefined").to_owned()),
            "main" => Some("undefined".to_owned()),
            _ => None,
        };
        output.push_str(&value.unwrap_or_default());
        rest = &tail[close + 1..];
    }
    output.push_str(rest);
    output
}
