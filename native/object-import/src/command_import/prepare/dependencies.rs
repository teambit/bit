use super::{
    PreparedImport, Target, identity, invalid, object_hash, read_model, read_version, receive,
    remote, transfer::receive_dependency, version_ref,
};
use serde_json::Value;
use std::{collections::HashSet, io};
pub(super) fn closure(
    plan: &mut PreparedImport,
    target: &Target,
    scope: &str,
    staged: &str,
    remotes: &Value,
    visited: &mut HashSet<String>,
) -> io::Result<()> {
    let identity = identity(target)?;
    if visited.len() > 4096 {
        return Err(invalid("import dependency closure limit"));
    }
    if !visited.insert(format!("{identity}@{}", target.version)) {
        return Ok(());
    }
    let (model, version) = load(plan, target, scope, staged, remotes)?;
    crate::history_query::validate_version(&version)?;
    if !plan.cache.fetch_all_dependencies && has_edges(plan, &version)? {
        return Ok(());
    }
    let dependencies = flattened_dependencies(plan, &version)?;
    let source = model
        .as_ref()
        .and_then(|model| model["scope"].as_str())
        .map(str::to_owned);
    for dependency in &dependencies {
        let dependency = dependency_target(dependency)?;
        if dependency.scope.as_deref() == Some(scope) || dependency.scope == source {
            closure(plan, &dependency, scope, staged, remotes, visited)?;
            continue;
        }
        // `flattenedDependencies` is already transitive, so a cached
        // dependency's own dependencies are not walked again.
        let source = source.as_deref().ok_or_else(|| invalid("import dependent scope"))?;
        cached(plan, &dependency, source, remotes, visited)?;
    }
    Ok(())
}

/// A dependency of another scope, as the dependent's remote serves it with
/// its dependencies (`getExternalMany` without `withoutDependencies`): taken
/// from that remote's cache and merged as not from its origin. A version the
/// local scope already has is kept.
fn cached(
    plan: &mut PreparedImport,
    target: &Target,
    source: &str,
    remotes: &Value,
    visited: &mut HashSet<String>,
) -> io::Result<()> {
    let identity = identity(target)?;
    if !visited.insert(format!("{identity}@{}", target.version)) {
        return Ok(());
    }
    let local = plan.environment.local_directory.clone();
    let present = read_model(plan, &local, target)?
        .as_ref()
        .and_then(|model| version_ref(model, &target.version).ok())
        .map(|hash| read_version(plan, &hash))
        .transpose()?
        .flatten()
        .is_some();
    if present {
        return Ok(());
    }
    let directory = remote(plan, remotes, source)?;
    let incoming = read_model(plan, &directory, target)?
        .ok_or_else(|| invalid("import cached dependency model absent"))?;
    let hash = version_ref(&incoming, &target.version)?;
    receive_dependency(plan, &directory, target, &incoming, &hash)
}
fn load(
    plan: &mut PreparedImport,
    target: &Target,
    scope: &str,
    staged: &str,
    remotes: &Value,
) -> io::Result<(Option<Value>, Value)> {
    let local = plan.environment.local_directory.clone();
    let mut model = read_model(plan, &local, target)?;
    let mut version = model
        .as_ref()
        .and_then(|model| version_ref(model, &target.version).ok())
        .map(|hash| read_version(plan, &hash))
        .transpose()?
        .flatten();
    let local_scope = target.scope.as_deref() == Some(scope);
    let built = version
        .as_ref()
        .is_some_and(|version| {
            matches!(version["buildStatus"].as_str(), Some("succeed" | "skipped"))
        });
    let staged_version = model
        .as_ref()
        .and_then(|model| version_ref(model, &target.version).ok())
        .is_some_and(|hash| staged.lines().any(|line| line == hash));
    let first_unbuilt = !built
        && !staged_version
        && plan.cache.unbuilt.insert(format!("{}@{}", identity(target)?, target.version));
    if version.is_none() || (!local_scope && first_unbuilt) {
        if local_scope {
            return Err(invalid("import missing local version"));
        }
        let hash = fetch(plan, target, remotes)?;
        model = read_model(plan, &local, target)?;
        version = read_version(plan, &hash)?;
    }
    let version = version.ok_or_else(|| invalid("import version absent after fetch"))?;
    Ok((model, version))
}
fn fetch(plan: &mut PreparedImport, target: &Target, remotes: &Value) -> io::Result<String> {
    let source = plan.cache.lane_sources
        .get(&identity(target)?)
        .cloned()
        .or_else(|| target.scope.clone())
        .ok_or_else(|| invalid("import dependency scope"))?;
    let directory = remote(plan, remotes, &source)?;
    let row = plan.progress.last_mut().ok_or_else(|| invalid("import progress phase"))?;
    row.ids.push(format!("{}@{}", identity(target)?, target.version));
    row.objects.insert(object_hash(&source));
    let incoming = read_model(plan, &directory, target)?
        .ok_or_else(|| invalid("import missing remote model"))?;
    let hash = version_ref(&incoming, &target.version)?;
    receive_fetched(plan, &directory, &source, target, &incoming, &hash)?;
    Ok(hash)
}

fn receive_fetched(
    plan: &mut PreparedImport,
    directory: &std::path::Path,
    source: &str,
    target: &Target,
    incoming: &Value,
    hash: &str,
) -> io::Result<()> {
    let version = plan.capture.object(directory, hash, "Version")?.and_then(|record| record.value);
    let Some(version) = version else {
        // A lane server may omit a tracked version absent from its cache that the client already has.
        if plan.cache.only_if_built && read_version(plan, hash)?.is_some() {
            return Ok(());
        }
        return Err(invalid("import remote dependency Version absent"));
    };
    if plan.cache.only_if_built
        && !matches!(version["buildStatus"].as_str(), Some("succeed" | "skipped"))
    {
        return Ok(());
    }
    if target.scope.as_deref() == Some(source) {
        receive(plan, directory, target, incoming, hash, false)
    } else {
        receive_dependency(plan, directory, target, incoming, hash)
    }
}

pub(super) fn has_edges(plan: &mut PreparedImport, version: &Value) -> io::Result<bool> {
    // Canonical preferDependencyGraph stops dependency expansion at nonempty edges.
    if version["flattenedEdges"]
        .as_array()
        .is_some_and(|edges| !edges.is_empty())
    {
        return Ok(true);
    }
    if let Some(hash) = version["flattenedEdgesRef"].as_str() {
        let bytes = if let Some(bytes) = plan.overlay.source(hash) {
            bytes.to_vec()
        } else {
            plan.capture
                .object(&plan.environment.local_directory.clone(), hash, "Source")?
                .and_then(|record| record.source)
                .ok_or_else(|| invalid("import dependency edges missing"))?
        };
        let edges: Value = serde_json::from_slice(&bytes).map_err(io::Error::other)?;
        if edges.as_array().is_none() {
            return Err(invalid("import dependency edges shape"));
        }
        if edges
            .as_array()
            .is_some_and(|edges| !edges.is_empty())
        {
            return Ok(true);
        }
    }
    Ok(false)
}
pub(super) fn flattened_dependencies(
    plan: &mut PreparedImport,
    version: &Value,
) -> io::Result<Vec<Value>> {
    let mut flattened = if let Some(rows) = version["flattenedDependencies"].as_array()
        && (!rows.is_empty() || !version["flattenedDependenciesRef"].is_string())
    {
        rows.clone()
    } else if let Some(hash) = version["flattenedDependenciesRef"].as_str() {
        let bytes = if let Some(bytes) = plan.overlay.source(hash) {
            bytes.to_vec()
        } else {
            plan.capture
                .object(&plan.environment.local_directory.clone(), hash, "Source")?
                .and_then(|record| record.source)
                .ok_or_else(|| invalid("import flattened dependencies missing"))?
        };
        let parsed: Value = serde_json::from_slice(&bytes).map_err(io::Error::other)?;
        parsed
            .as_array()
            .ok_or_else(|| invalid("import flattened dependencies"))?
            .clone()
    } else {
        version["flattenedDependencies"]
            .as_array()
            .ok_or_else(|| invalid("import flattened dependencies"))?
            .clone()
    };
    if let Some(dev) = version["flattenedDevDependencies"].as_array() {
        flattened.extend(dev.iter().cloned());
    }
    Ok(flattened)
}
pub(super) fn dependency_target(value: &Value) -> io::Result<Target> {
    if let Some(text) = value
        .as_str()
        .or_else(|| value["id"].as_str())
    {
        let (identity, version) =
            text.rsplit_once('@').ok_or_else(|| invalid("import dependency version"))?;
        let (scope, name) =
            identity.split_once('/').ok_or_else(|| invalid("import dependency identity"))?;
        return Ok(Target {
            scope: Some(scope.to_owned()),
            name: name.to_owned(),
            version: version.to_owned(),
        });
    }
    let id_obj = value
        .get("id")
        .filter(|sub| sub.is_object())
        .unwrap_or(value);
    let scope = id_obj["scope"]
        .as_str()
        .or_else(|| value["scope"].as_str())
        .ok_or_else(|| invalid("import dependency scope"))?;
    let raw_name = id_obj["name"]
        .as_str()
        .or_else(|| value["name"].as_str())
        .ok_or_else(|| invalid("import dependency name"))?;
    let (name, inline_ver) = raw_name
        .rsplit_once('@')
        .map_or((raw_name, None), |(bare, ver)| (bare, Some(ver).filter(|ver| !ver.is_empty())));
    let version = value["version"]
        .as_str()
        .or_else(|| id_obj["version"].as_str())
        .or_else(|| id_obj["head"].as_str())
        .or_else(|| value["head"].as_str())
        .filter(|ver| !ver.is_empty())
        .or(inline_ver)
        .ok_or_else(|| invalid("import dependency version"))?;
    Ok(Target { scope: Some(scope.to_owned()), name: name.to_owned(), version: version.to_owned() })
}
pub(super) fn only_unbuilt_requests(
    plan: &mut PreparedImport,
    targets: &[&Target],
    scope: &str,
    staged: &str,
) -> io::Result<bool> {
    for target in targets {
        if !request_available(plan, target, scope, staged)? {
            return Ok(false);
        }
    }
    Ok(true)
}
fn loaded(plan: &mut PreparedImport, target: &Target) -> io::Result<Option<(String, Value)>> {
    let local = plan.environment.local_directory.clone();
    let Some(model) = read_model(plan, &local, target)? else { return Ok(None) };
    let Ok(hash) = version_ref(&model, &target.version) else { return Ok(None) };
    Ok(read_version(plan, &hash)?.map(|version| (hash, version)))
}
fn available(target: &Target, hash: &str, version: &Value, scope: &str, staged: &str) -> bool {
    target.scope.as_deref() == Some(scope)
        || staged.lines().any(|line| line == hash)
        || matches!(version["buildStatus"].as_str(), Some("succeed" | "skipped"))
}
fn request_available(
    plan: &mut PreparedImport,
    target: &Target,
    scope: &str,
    staged: &str,
) -> io::Result<bool> {
    let Some((hash, version)) = loaded(plan, target)? else { return Ok(false) };
    if !available(target, &hash, &version, scope, staged) {
        return Ok(true);
    }
    if version["flattenedEdges"]
        .as_array()
        .is_some_and(|rows| !rows.is_empty())
        || version["flattenedEdgesRef"].is_string()
    {
        return Ok(true);
    }
    let flattened = flattened_dependencies(plan, &version)?;
    for value in &flattened {
        let dependency = dependency_target(value)?;
        let Some((hash, version)) = loaded(plan, &dependency)? else {
            return Ok(false);
        };
        if !available(&dependency, &hash, &version, scope, staged) {
            return Ok(false);
        }
    }
    Ok(true)
}
