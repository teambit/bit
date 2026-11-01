//! `ForkingMain.extractDeps` projects captured resolver dependencies without importing components.
use super::unsupported;
use serde_json::{Value, json};
use std::io;

pub fn dependency_policy(source: &Value) -> io::Result<Vec<Value>> {
    let dependencies =
        source["dependencies"].as_array().ok_or_else(|| unsupported("fork dependency metadata"))?;
    if dependencies.len() > 4096 {
        return Err(unsupported("fork dependency count budget"));
    }
    let excluded = source["excludedComponents"].as_array();
    let prefix = source["savePrefix"].as_str().map_or("^", str::trim);
    let mut output = Vec::new();
    for dependency in dependencies
        .iter()
        .filter(|row| row["source"].as_str().map(str::trim) == Some("auto"))
    {
        if excluded_dependency(dependency, excluded) {
            continue;
        }
        let id = dependency["packageName"]
            .as_str()
            .or_else(|| dependency["id"].as_str())
            .map(str::trim)
            .filter(|id| !id.is_empty())
            .map(str::to_owned)
            .or_else(|| component_identity(&dependency["id"]))
            .ok_or_else(|| unsupported("fork dependency package identity"))?;
        let version = dependency["version"]
            .as_str()
            .map(str::trim)
            .filter(|version| !version.is_empty())
            .ok_or_else(|| unsupported("fork dependency version"))?;
        let version = version_with_prefix(version, prefix)?;
        let lifecycle = dependency["lifecycle"]
            .as_str()
            .map(str::trim)
            .filter(|lifecycle| !lifecycle.is_empty())
            .unwrap_or("runtime");
        output.push(json!({"dependencyId":id,"lifecycleType":if lifecycle=="dev"{"runtime"}else{lifecycle},"value":{"version":version}}));
    }
    Ok(output)
}
fn excluded_dependency(row: &Value, excluded: Option<&Vec<Value>>) -> bool {
    let Some(component) = row
        .get("componentId")
        .filter(|val| !val.is_null())
    else {
        return row["id"].as_str().map(str::trim) == Some("@teambit/legacy");
    };
    let Some(rows) = excluded.filter(|rows| !rows.is_empty()) else {
        return false;
    };
    let Some(identity) = component_identity(component) else {
        return false;
    };
    rows.iter()
        .any(|row| {
            row.as_str().map(str::trim) == Some(identity.as_str())
                || component_identity(row).as_deref() == Some(identity.as_str())
        })
}
fn component_identity(component: &Value) -> Option<String> {
    component
        .as_str()
        .map(|id| {
            let trimmed = id.trim();
            trimmed.rsplit_once('@').map_or(trimmed, |(bare, _)| bare.trim())
        })
        .filter(|id| !id.is_empty())
        .map(str::to_owned)
        .or_else(|| {
            let scope = component["scope"].as_str()?.trim();
            let raw_name = component["name"].as_str()?.trim();
            let name = raw_name.rsplit_once('@').map_or(raw_name, |(bare, _)| bare.trim());
            (!scope.is_empty() && !name.is_empty()).then(|| format!("{scope}/{name}"))
        })
}

fn version_with_prefix(version: &str, prefix: &str) -> io::Result<String> {
    if version.len() == 40 && version.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return Ok(format!("0.0.0-{version}"));
    }
    if node_semver::Version::parse(version).is_err() {
        return Ok(version.into());
    }
    if version
        .split('+')
        .next()
        .is_some_and(|version| version.contains('-'))
    {
        return Ok(version.into());
    }
    let output = format!("{prefix}{version}");
    node_semver::Range::parse(&output)
        .map_err(|_| super::invalid(format!(r#"the version "{output}" is invalid"#)))?;
    Ok(output)
}
