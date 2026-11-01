use super::{Output, Request};
use crate::workspace::engine::{dependency_policy::wire::version, invalid};
use serde_json::Value;
use std::io;

pub(super) fn apply(request: &Request, output: &mut Output) -> io::Result<()> {
    remove_existing(request, output);
    for (name, value) in &request.environment.policy {
        let trimmed = name.trim();
        if trimmed.is_empty() {
            continue;
        }
        let value = if let Some(placeholder) = value
            .as_str()
            .map(str::trim)
            .filter(|value| crate::plus_version::is_plus(value))
        {
            let resolved = resolve(request, trimmed)?;
            Value::String(crate::plus_version::resolve(placeholder, Some(&resolved), "*"))
        } else {
            value.clone()
        };
        output.state.packages[0].insert(trimmed.to_owned(), value);
    }
    Ok(())
}

#[inline]
fn remove_existing(request: &Request, output: &mut Output) {
    for name in request.environment.policy.keys() {
        let trimmed = name.trim();
        if trimmed.is_empty() || version(&request.environment.policy, trimmed).is_none() {
            continue;
        }
        for packages in &mut output.state.packages {
            packages.shift_remove(name);
            packages.shift_remove(trimmed);
        }
    }
}
fn resolve(request: &Request, name: &str) -> io::Result<String> {
    let name = name.trim();
    if let Some(value) = request.resolved
        .get(name)
        .and_then(|package| package.concrete_version.as_deref())
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        return Ok(value.to_owned());
    }
    if let Some(value) = version(&request.environment.workspace.dependencies, name)
        .or_else(|| version(&request.environment.workspace.peer_dependencies, name))
    {
        return Ok(value);
    }
    if let Some(entry) = request.environment.model_components
        .iter()
        .find(|entry| entry.package_name.as_deref().map(str::trim) == Some(name))
    {
        let value = extract_model_component_version(&entry.identity)
            .ok_or_else(|| invalid("dependency policy model version unavailable"))?;
        return Ok(value.to_owned());
    }
    Ok(version(&request.environment.model_packages, name).unwrap_or_else(|| "*".to_owned()))
}

#[inline]
fn extract_model_component_version(identity: &str) -> Option<&str> {
    let trimmed = identity.trim();
    let (base, ver) = trimmed.rsplit_once('@')?;
    let ver = ver.trim();
    (!base.trim().is_empty() && !ver.is_empty() && !ver.contains('/')).then_some(ver)
}

/// Resolve automatic package placeholders before the environment's own policy replaces them.
#[inline]
pub(super) fn automatic(request: &Request, output: &mut Output) -> io::Result<()> {
    for packages in &mut output.state.packages {
        for (name, value) in packages {
            let Some(placeholder) = value
                .as_str()
                .map(str::trim)
                .filter(|value| crate::plus_version::is_plus(value))
            else {
                continue;
            };
            let resolved = preferred(request, name)?;
            *value = Value::String(crate::plus_version::resolve(placeholder, Some(&resolved), "*"));
        }
    }
    Ok(())
}
fn preferred(request: &Request, name: &str) -> io::Result<String> {
    let name = name.trim();
    let workspace = version(&request.environment.workspace.dependencies, name)
        .or_else(|| version(&request.environment.workspace.peer_dependencies, name));
    let Some(workspace) = workspace.filter(|version| !version.is_empty()) else {
        return resolve(request, name);
    };
    let Ok(range) = node_semver::Range::parse(&workspace) else { return Ok(workspace) };
    if let Some(installed) = request.resolved
        .get(name)
        .and_then(|package| package.concrete_version.as_deref())
        .map(str::trim)
        .filter(|installed| !installed.is_empty())
        && node_semver::Version::parse(installed).is_ok_and(|version| range.satisfies(&version))
    {
        return Ok(installed.to_owned());
    }
    if node_semver::npm::valid_range(&workspace).as_deref() == Some("*") {
        return Ok(workspace);
    }
    Ok(node_semver::npm::min_version(&workspace)
        .ok()
        .flatten()
        .map_or(workspace, |version| version.version))
}
