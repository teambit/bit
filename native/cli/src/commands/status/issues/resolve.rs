//! For snap and tag, the engine proves
//! the models' heads and the dependencies outside the workspace.

use super::{super::js::truthy, Component};
use serde_json::Value;
use std::collections::{HashMap, HashSet};

/// `ordinaryResolveIssueHeads(context, receipt)`: one row per model with
/// its head (and its lane head), none deprecated or removed. A `null`
/// version is an absent object, which counts as ordinary.
pub fn ordinary_heads(context: &Value, receipt: &Value) -> bool {
    let (Some(models), Some(rows)) = (context["models"].as_array(), receipt.as_array()) else {
        return false;
    };
    rows.len() == models.len()
        && models
            .iter()
            .zip(rows)
            .all(|(model, row)| ordinary_model(context, model, row))
}

fn ordinary_model(context: &Value, model: &Value, row: &Value) -> bool {
    if truthy(model.get("deprecated")) {
        return false;
    }
    let (Some(scope), Some(name)) = (model["scope"].as_str(), model["name"].as_str()) else {
        return false;
    };
    let identity = format!("{scope}/{name}");
    let lane = context["lane"]["targets"]
        .as_array()
        .and_then(|targets| {
            targets
                .iter()
                .find(|target| target["identity"] == identity.as_str())
        });
    let mut expected: Vec<&Value> = Vec::new();
    for hash in [&model["head"], lane.map_or(&Value::Null, |lane| &lane["currentHead"])] {
        if !hash.is_null() && !expected.contains(&hash) {
            expected.push(hash);
        }
    }
    let heads = row["heads"].as_array();
    if row["identity"] != identity.as_str()
        || heads.is_none_or(|heads| heads.len() != expected.len())
    {
        return false;
    }
    heads
        .into_iter()
        .flatten()
        .zip(expected)
        .all(|(head, expected)| ordinary_head(head, expected))
}

fn ordinary_head(head: &Value, expected: &Value) -> bool {
    let hash = head["hash"].as_str();
    let valid = hash.is_some_and(|hash| {
        hash.len() == 40
            && hash
                .bytes()
                .all(|byte| matches!(byte, b'0'..=b'9' | b'a'..=b'f'))
    });
    if !valid || &head["hash"] != expected {
        return false;
    }
    let Some(version) = head.get("version") else { return false };
    if version.is_null() {
        return true;
    }
    let extensions = match version.get("extensions") {
        None | Some(Value::Null) => Some(&[][..]),
        Some(extensions) => extensions.as_array().map(Vec::as_slice),
    };
    version.is_object()
        && extensions.is_some_and(|extensions| {
            !extensions
                .iter()
                .any(|extension| {
                    matches!(
                        extension["name"].as_str(),
                        Some("teambit.component/deprecation" | "teambit.component/remove"),
                    )
                })
        })
}

/// `resolveExternalIssueVertices(components, receipt)`: every dependency
/// outside the workspace reachable through the engine's external rows,
/// with no row left over; `None` when the receipt does not prove that.
pub fn external_vertices(
    components: &[Component],
    receipt: Option<&Value>,
) -> Option<Vec<Component>> {
    let workspace: HashSet<&str> = components
        .iter()
        .map(|component| component.identity.as_str())
        .collect();
    let requested: Vec<&str> = components
        .iter()
        .flat_map(|component| component.dependencies.iter().map(String::as_str))
        .filter(|id| !workspace.contains(id))
        .collect();
    let Some(receipt) = receipt else { return requested.is_empty().then(Vec::new) };
    let external = external_rows(receipt, &workspace)?;
    let mut seen = HashSet::new();
    let mut pending = requested;
    let mut edges = 0;
    while let Some(id) = pending.pop() {
        if workspace.contains(id) || !seen.insert(id) {
            continue;
        }
        let row = external.get(id)?;
        edges += row.dependencies.len();
        if edges > 16384 {
            return None;
        }
        pending.extend(row.dependencies.iter().map(String::as_str));
    }
    (seen.len() == external.len()).then(|| external.values().cloned().collect())
}

/// The receipt's `external` rows, validated, by identity.
fn external_rows(receipt: &Value, workspace: &HashSet<&str>) -> Option<HashMap<String, Component>> {
    let object = receipt.as_object()?;
    let rows = object.get("external")?.as_array()?;
    if object
        .keys()
        .any(|key| key != "external")
        || rows.len() > 4096
    {
        return None;
    }
    let mut external = HashMap::new();
    for row in rows {
        let component = external_row(row, workspace)?;
        if external.contains_key(&component.identity) {
            return None;
        }
        external.insert(component.identity.clone(), component);
    }
    Some(external)
}

/// One external vertex: a versioned id outside the workspace, its distinct
/// dependencies, and a proven absent model.
fn external_row(row: &Value, workspace: &HashSet<&str>) -> Option<Component> {
    let identity = row["identity"].as_str().filter(|identity| versioned(identity))?;
    let dependencies: Vec<String> = row["dependencies"]
        .as_array()?
        .iter()
        .map(|id| {
            id.as_str()
                .filter(|id| workspace.contains(id) || versioned(id))
                .map(str::to_string)
        })
        .collect::<Option<_>>()?;
    let unique: HashSet<&String> = dependencies.iter().collect();
    let keys = row
        .as_object()?
        .keys()
        .all(|key| matches!(key.as_str(), "identity" | "dependencies" | "model"));
    let absent_model = row.get("model").is_some_and(Value::is_null);
    if !keys || !absent_model || workspace.contains(identity) || unique.len() != dependencies.len()
    {
        return None;
    }
    Some(Component {
        identity: identity.to_string(),
        package_name: String::new(),
        dependencies,
        issues: Value::Null,
    })
}

/// `/^[^@\s]+\/[^@\s]+@[^@\s]+$/`.
fn versioned(value: &str) -> bool {
    let plain = |part: &str| {
        !part.is_empty() && !part.contains('@') && !part.chars().any(char::is_whitespace)
    };
    let Some((id, version)) = value.split_once('@') else { return false };
    let Some((scope, name)) = id.split_once('/') else { return false };
    plain(scope) && plain(name) && plain(version)
}

#[cfg(test)]
mod resolve_tests;
