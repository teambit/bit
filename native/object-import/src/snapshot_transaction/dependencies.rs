use super::{autotag, invalid};
use serde_json::{Value, json};
use std::io;

pub(super) fn plan(input: &Value) -> io::Result<Value> {
    let components = array(input, "components")?;
    if components.len() > 4096 {
        return Err(invalid("snapshot dependency component budget"));
    }
    for component in components {
        autotag::identity(&component["id"])?;
    }
    let selected = match input.get("index") {
        None => (0..components.len()).collect::<Vec<_>>(),
        Some(index) => vec![
            index
                .as_u64()
                .and_then(|index| usize::try_from(index).ok())
                .filter(|index| *index < components.len())
                .ok_or_else(|| invalid("snapshot dependency selected index"))?,
        ],
    };
    let mut output = Vec::new();
    for index in selected {
        let component = &components[index];
        if component["removed"]
            .as_bool()
            .ok_or_else(|| invalid("snapshot dependency removed flag"))?
        {
            continue;
        }
        output.push(row(index, component, components)?);
    }
    Ok(json!({"components":output}))
}
fn row(index: usize, component: &Value, components: &[Value]) -> io::Result<Value> {
    let dependencies = dependency_rows(component, components)?;
    let extensions = extension_rows(component, components)?;
    let mut resolver = Vec::new();
    if component.get("resolver").is_some() {
        resolver = resolver_rows(component, components)?;
    }
    Ok(
        json!({"index":index,"dependencies":dependencies,"extensions":extensions,"resolver":resolver}),
    )
}
fn normalize_component_id(id: &Value, version: String) -> io::Result<Value> {
    let mut normalized = id.clone();
    if normalized.is_object() {
        normalized["version"] = Value::String(version);
        return Ok(normalized);
    }
    let key = autotag::identity(&normalized)?;
    if let Some((scope, name)) = key.split_once('/') {
        normalized = json!({"scope": scope, "name": name, "version": version});
    }
    Ok(normalized)
}
fn resolver_rows(component: &Value, components: &[Value]) -> io::Result<Vec<Value>> {
    let mut output = Vec::new();
    for (index, dependency) in array(component, "resolver")?.iter().enumerate() {
        if dependency["type"].as_str().map(str::trim) != Some("component") {
            continue;
        }
        let id = dependency
            .get("componentId")
            .ok_or_else(|| invalid("snapshot resolver component ID missing"))?;
        let target = target(id, components)?;
        let normalized = match target {
            Some(idx) => normalize_component_id(id, target_version(&components[idx]["id"])?)?,
            None => id.clone(),
        };
        let mut patch = json!({"index":index,"id":normalized});
        if let Some(target) = target {
            patch["target"] = json!(target);
        }
        output.push(patch);
    }
    Ok(output)
}
fn target_version(id: &Value) -> io::Result<String> {
    non_empty_str(&id["version"])
        .or_else(|| non_empty_str(&id["head"]))
        .or_else(|| {
            id.as_str()
                .and_then(|raw| {
                    raw.rsplit_once('@')
                        .map(|(_, ver)| ver.trim())
                        .filter(|ver| !ver.is_empty())
                })
        })
        .map(str::to_owned)
        .ok_or_else(|| invalid("snapshot target version missing"))
}
fn non_empty_str(value: &Value) -> Option<&str> {
    value
        .as_str()
        .map(str::trim)
        .filter(|text| !text.is_empty())
}
fn target(id: &Value, components: &[Value]) -> io::Result<Option<usize>> {
    let key = autotag::identity(id)?;
    for (index, component) in components.iter().enumerate() {
        if component["removed"].as_bool() != Some(true)
            && autotag::identity(&component["id"])? == key
        {
            return Ok(Some(index));
        }
    }
    Ok(None)
}
fn is_snap(version: &str) -> bool {
    version.len() == 40 && version.bytes().all(|byte| byte.is_ascii_hexdigit())
}
fn array<'a>(value: &'a Value, field: &str) -> io::Result<&'a [Value]> {
    let rows = value[field].as_array().ok_or_else(|| invalid("snapshot dependency rows"))?;
    if rows.len() > 65536 {
        return Err(invalid("snapshot dependency row budget"));
    }
    Ok(rows)
}

fn dependency_rows(component: &Value, components: &[Value]) -> io::Result<Vec<Value>> {
    let mut dependencies = Vec::new();
    for (index, dependency) in array(component, "dependencies")?.iter().enumerate() {
        if let Some(target) = target(&dependency["id"], components)? {
            let mut patch = json!({"index":index,"target":target});
            let version = target_version(&components[target]["id"])?;
            if let Some(prefix) = component["rangePrefix"]
                .as_str()
                .filter(|prefix| matches!(*prefix, "^" | "~"))
                && !is_snap(&version)
            {
                patch["versionRange"] = json!(format!("{prefix}{version}"));
            }
            dependencies.push(patch);
        }
    }
    Ok(dependencies)
}

fn extension_rows(component: &Value, components: &[Value]) -> io::Result<Vec<Value>> {
    let mut extensions = Vec::new();
    for (index, extension) in array(component, "extensions")?.iter().enumerate() {
        if let Some(id) = extension
            .get("id")
            .or_else(|| extension.get("extensionId"))
            .filter(|value| !value.is_null())
            && let Some(target) = target(id, components)?
        {
            extensions.push(json!({"index":index,"target":target}));
        }
    }
    Ok(extensions)
}
