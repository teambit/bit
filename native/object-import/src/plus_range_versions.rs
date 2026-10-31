//! `getPlusRangeVersionsUsage`: collect gated range placeholders in snapshot inputs.
use serde_json::Value;

/// Dependency rows retain consumer order; repeated descriptions appear only once.
#[must_use]
pub fn usages(
    dependencies: &[Value],
    extensions: &[Value],
    environment: Option<&Value>,
) -> Vec<String> {
    let mut usages = dependencies
        .iter()
        .filter_map(dependency_usage)
        .collect::<Vec<_>>();
    resolver_usages(&mut usages, extensions);
    if let Some(policy) = environment.and_then(|value| value["policy"].as_object()) {
        for (field, entries) in policy {
            environment_usages(&mut usages, field, entries);
        }
    }
    let mut unique = Vec::new();
    for usage in usages {
        if !unique.contains(&usage) {
            unique.push(usage);
        }
    }
    unique
}
fn dependency_usage(dependency: &Value) -> Option<String> {
    if !is_range(&dependency["versionRange"]) {
        return None;
    }
    let identity = dependency["id"]
        .as_str()
        .or_else(|| dependency.as_str())
        .map_or_else(
            || {
                let target = dependency
                    .get("id")
                    .filter(|sub| sub.is_object())
                    .unwrap_or(dependency);
                format!("{}/{}", text(&target["scope"]), text(&target["name"]))
            },
            |id| {
                id.trim()
                    .split('@')
                    .next()
                    .unwrap_or(id)
                    .trim()
                    .to_owned()
            },
        );
    let name = dependency["packageName"]
        .as_str()
        .map(str::trim)
        .filter(|name| !name.is_empty())
        .unwrap_or(&identity);
    Some(format!(r#"{name}: "{}""#, text(&dependency["versionRange"])))
}
fn resolver_usages(usages: &mut Vec<String>, extensions: &[Value]) {
    let Some(resolver) = extensions
        .iter()
        .find(|extension| {
            crate::workspace::engine::client_status::config::is_extension_aspect(
                extension,
                "teambit.dependencies/dependency-resolver",
            )
        })
    else {
        return;
    };
    for entry in resolver["data"]["policy"]
        .as_array()
        .into_iter()
        .flatten()
    {
        if is_range(&entry["value"]["version"]) {
            usages.push(format!(
                r#"{}: "{}""#,
                text(&entry["dependencyId"]),
                text(&entry["value"]["version"]),
            ));
        }
    }
}
fn environment_usages(usages: &mut Vec<String>, field: &str, entries: &Value) {
    if let Some(entries) = entries.as_array() {
        for entry in entries {
            for key in ["version", "supportedRange"] {
                env_usage(usages, field, text(&entry["name"]), &entry[key]);
            }
        }
        return;
    }
    for (name, value) in entries
        .as_object()
        .into_iter()
        .flatten()
    {
        env_usage(
            usages,
            field,
            name.trim(),
            if value.is_string() { value } else { &value["version"] },
        );
    }
}
fn env_usage(usages: &mut Vec<String>, field: &str, name: &str, value: &Value) {
    if is_range(value) {
        usages.push(format!(r#"env.jsonc policy.{field} {name}: "{}""#, text(value)));
    }
}
fn is_range(value: &Value) -> bool {
    matches!(value.as_str().map(str::trim), Some("+^" | "+~"))
}
fn text(value: &Value) -> &str {
    value
        .as_str()
        .map(str::trim)
        .filter(|val| !val.is_empty())
        .unwrap_or("undefined")
}
