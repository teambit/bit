//! `ForkingMain.extractDeps` projects captured resolver dependencies without importing components.
use super::unsupported;
use serde_json::{Value, json};
use std::io;

pub fn dependency_policy(source: &Value) -> io::Result<Vec<Value>> {
    let dependencies =
        source["dependencies"].as_array().ok_or_else(|| unsupported("fork dependency metadata"))?;
    let excluded = source["excludedComponents"].as_array();
    let prefix = source["savePrefix"].as_str().unwrap_or("^");
    let mut output = Vec::new();
    for dependency in dependencies
        .iter()
        .filter(|row| row["source"] == "auto")
    {
        if excluded_dependency(dependency, excluded) {
            continue;
        }
        let id = dependency["packageName"]
            .as_str()
            .or_else(|| dependency["id"].as_str())
            .map(str::to_owned)
            .or_else(|| component_identity(&dependency["id"]))
            .ok_or_else(|| unsupported("fork dependency package identity"))?;
        let version =
            dependency["version"].as_str().ok_or_else(|| unsupported("fork dependency version"))?;
        let version = version_with_prefix(version, prefix)?;
        let lifecycle = dependency["lifecycle"].as_str().unwrap_or("runtime");
        output.push(json!({"dependencyId":id,"lifecycleType":if lifecycle=="dev"{"runtime"}else{lifecycle},"value":{"version":version}}));
    }
    Ok(output)
}
fn excluded_dependency(row: &Value, excluded: Option<&Vec<Value>>) -> bool {
    let Some(component) = row.get("componentId") else { return row["id"] == "@teambit/legacy" };
    let Some(identity) = component_identity(component) else { return false };
    excluded.is_some_and(|rows| {
        rows.iter()
            .any(|row| row == &identity || component_identity(row).as_deref() == Some(&identity))
    })
}
fn component_identity(component: &Value) -> Option<String> {
    component
        .as_str()
        .map(|id| {
            id.split('@')
                .next()
                .unwrap_or(id)
                .to_owned()
        })
        .or_else(|| {
            Some(format!("{}/{}", component["scope"].as_str()?, component["name"].as_str()?))
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
