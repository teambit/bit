//! The issues that block a snap, computed over the projected workspace, must be
//! the ones the engine predicted: none, or the snap error it reported.

use crate::commands::status::{
    issues::{self, Component},
    js::{array, decline, text, truthy, without_version},
};
use serde_json::{Value, json};
use std::{collections::HashSet, io, path::Path};

pub fn validate(
    root: &Path,
    context: &Value,
    components: &[Component],
    plan: &Value,
) -> io::Result<()> {
    let projected = match plan.get("issueTargets") {
        None => &[][..],
        Some(projected) => array(Some(projected), "issue targets")?,
    };
    let policy = plan
        .get("policyPreparation")
        .filter(|policy| truthy(Some(policy)));
    if policy.is_some() && projected.is_empty() {
        return Err(decline("command issue targets absent"));
    }
    let merged = merged(components, projected)?;
    let found = issues::collect(root, context, &merged)?
        .ok_or_else(|| decline("command issue callback requires canonical loading"))?;
    let selected = selected(plan, policy)?;
    let errors = if plan.get("snapFailed") == Some(&Value::Bool(true)) {
        array(plan["result"]["mergeSnapError"].get("components"), "snap error components")?
    } else {
        &[][..]
    };
    for component in &found {
        let id = text(component.get("id"))?;
        if selected.contains(id) && !predicted(component, id, errors)? {
            return Err(decline("command unsupported snapshot issue"));
        }
    }
    Ok(())
}

/// Whether the component's tag-blocking issues are the ones the snap error
/// lists for it, compared as JSON text.
fn predicted(component: &Value, id: &str, errors: &[Value]) -> io::Result<bool> {
    let expected = errors
        .iter()
        .find(|entry| {
            let Some(entry_id) = entry.get("id") else {
                return false;
            };
            if let Some(raw) = entry_id.as_str() {
                without_version(raw) == id
            } else {
                let scope = entry_id["scope"].as_str().unwrap_or_default();
                let name = entry_id["name"].as_str().unwrap_or_default();
                format!("{scope}/{name}") == id
            }
        })
        .and_then(|entry| entry.get("issues").cloned())
        .unwrap_or_else(|| json!([]));
    let actual = serde_json::to_string(&blockers(component)?).map_err(io::Error::other)?;
    Ok(actual == serde_json::to_string(&expected).map_err(io::Error::other)?)
}

/// The tag-blocking issues: their type and their data as JSON.
fn blockers(component: &Value) -> io::Result<Value> {
    let issues = array(component.get("issues"), "component issues")?
        .iter()
        .filter(|issue| issue.get("isTagBlocker") == Some(&Value::Bool(true)))
        .map(|issue| {
            let data = serde_json::to_string(&issue["data"]).map_err(io::Error::other)?;
            Ok(json!({ "type": issue["type"], "data": data }))
        })
        .collect::<io::Result<Vec<_>>>()?;
    Ok(Value::Array(issues))
}

/// The divergent policy targets, or the components the merge snaps.
fn selected<'p>(plan: &'p Value, policy: Option<&'p Value>) -> io::Result<HashSet<&'p str>> {
    let Some(policy) = policy else {
        return array(plan.get("needsSnap"), "needs snap")?
            .iter()
            .map(|id| text(Some(id)))
            .collect();
    };
    array(policy.get("targets"), "policy targets")?
        .iter()
        .filter(|target| !truthy(target.get("fastForward")))
        .map(|target| text(target.get("identity")))
        .collect()
}

/// `projectedIssueComponents`: the captured components with the engine's
/// projected metadata in place of each merged one.
fn merged(components: &[Component], projected: &[Value]) -> io::Result<Vec<Component>> {
    let mut replacements: Vec<(String, Component)> = Vec::new();
    for row in projected {
        let identity = text(row.get("identity"))?;
        let base = without_version(identity).to_string();
        let known = components
            .iter()
            .any(|component| without_version(&component.identity) == base);
        if !known
            || replacements
                .iter()
                .any(|(seen, _)| *seen == base)
        {
            return Err(decline("command issue target identity"));
        }
        let ignored = components
            .iter()
            .find(|component| without_version(&component.identity) == base)
            .map_or_else(Vec::new, |component| component.ignored.clone());
        let component = projected_component(row, identity, ignored)?;
        replacements.push((base, component));
    }
    Ok(components
        .iter()
        .map(|component| {
            let base = without_version(&component.identity);
            replacements
                .iter()
                .find(|(identity, _)| identity == base)
                .map_or_else(|| component.clone(), |(_, replacement)| replacement.clone())
        })
        .collect())
}

fn projected_component(row: &Value, identity: &str, ignored: Vec<String>) -> io::Result<Component> {
    let dependencies = array(row.get("dependencies"), "issue target dependencies")?
        .iter()
        .map(|id| text(Some(id)).map(str::to_string))
        .collect::<io::Result<_>>()?;
    Ok(Component {
        ignored,
        identity: identity.to_string(),
        package_name: text(row.get("packageName"))?.to_string(),
        dependencies,
        issues: row
            .get("issues")
            .cloned()
            .unwrap_or(Value::Null),
    })
}
