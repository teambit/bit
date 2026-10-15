use super::{invalid, wire::Complete};
use serde_json::Value;
use std::io;

pub(super) fn detected(request: &Complete) -> io::Result<Value> {
    if request.finish["selfIdentity"] != request.capture.identity {
        return Err(invalid("fresh dependency identity receipt"));
    }
    let mut detected = request.capture.detected.clone();
    if detected["coreAspects"] != serde_json::json!([]) {
        return Err(invalid("fresh detection issue boundary"));
    }
    validate_issues(&detected["issues"])?;
    apply_versions(&mut detected, request)?;
    Ok(detected)
}
fn validate_issues(value: &Value) -> io::Result<()> {
    let issues = value.as_array().ok_or_else(|| invalid("fresh detection issues"))?;
    if issues.len() > 3 {
        return Err(invalid("fresh detection issue count"));
    }
    for issue in issues {
        if !matches!(
            issue["type"].as_str(),
            Some(
                "MissingDependenciesOnFs"
                    | "ImportFromDirectory"
                    | "MissingPackagesDependenciesOnFs",
            ),
        ) {
            return Err(invalid("fresh detection issue boundary"));
        }
        let data = issue["data"].as_str().ok_or_else(|| invalid("fresh detection issue data"))?;
        if issue["type"] == "MissingPackagesDependenciesOnFs" {
            validate_missing_packages(data)?;
        } else {
            validate_file_issue(data)?;
        }
    }
    Ok(())
}
fn validate_missing_packages(data: &str) -> io::Result<()> {
    let rows: Vec<Value> = serde_json::from_str(data).map_err(io::Error::other)?;
    if rows.len() > 4096 || rows.iter().any(invalid_missing_package_row) {
        return Err(invalid("fresh detection missing packages"));
    }
    Ok(())
}
fn invalid_missing_package_row(row: &Value) -> bool {
    !row["filePath"].is_string()
        || !row["isDevFile"].is_boolean()
        || row["missingPackages"]
            .as_array()
            .is_none_or(|names| {
                names.len() > 4096
                    || names
                        .iter()
                        .any(|name| !name.is_string())
            })
}
fn validate_file_issue(data: &str) -> io::Result<()> {
    let parsed: serde_json::Map<String, Value> =
        serde_json::from_str(data).map_err(io::Error::other)?;
    if parsed.len() > 4096
        || parsed
            .values()
            .any(|value| {
                value
                    .as_array()
                    .is_none_or(|items| {
                        items.len() > 4096
                            || items
                                .iter()
                                .any(|item| !item.is_string())
                    })
            })
    {
        return Err(invalid("fresh detection issue data"));
    }
    Ok(())
}
fn apply_versions(detected: &mut Value, request: &Complete) -> io::Result<()> {
    for version in &request.capture.component_versions {
        let field = ["dependencies", "devDependencies", "peerDependencies"]
            .get(version.field)
            .ok_or_else(|| invalid("fresh component lifecycle"))?;
        let id = detected["allDependencies"][field]
            .get_mut(version.index)
            .and_then(|dependency| dependency.get_mut("id"))
            .and_then(Value::as_object_mut)
            .ok_or_else(|| invalid("fresh component version receipt"))?;
        let chosen = match select(version.concrete.as_deref(), &request.resolution["grammar"])? {
            Some(value) => Some(value),
            None => select(version.dependent.as_deref(), &request.resolution["grammar"])?,
        };
        if let Some(version) = chosen {
            id.insert("version".to_owned(), Value::String(version));
        }
    }
    Ok(())
}
fn select(version: Option<&str>, grammar: &Value) -> io::Result<Option<String>> {
    let Some(version) = version.filter(|version| !version.is_empty()) else { return Ok(None) };
    if let Some(hash) = version.strip_prefix("0.0.0-").filter(|hash| snap(hash)) {
        return Ok(Some(hash.to_owned()));
    }
    let parsed = grammar.get(version).ok_or_else(|| invalid("fresh component version grammar"))?;
    if parsed["valid"] == true {
        return Ok(Some(version.to_owned()));
    }
    if parsed["range"] == true
        && let Some(coerced) = parsed["coerced"].as_str()
    {
        return Ok(Some(coerced.to_owned()));
    }
    Ok(snap(version).then(|| version.to_owned()))
}
fn snap(version: &str) -> bool {
    version.len() == 40 && version.bytes().all(|byte| byte.is_ascii_hexdigit())
}
