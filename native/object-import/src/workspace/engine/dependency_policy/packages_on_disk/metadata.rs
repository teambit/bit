use super::{Value, invalid, io, json};

pub(super) fn resolved(
    name: &str,
    package: Option<&Value>,
    dependent: Option<&Value>,
) -> io::Result<Option<Value>> {
    let fallback = dependent.is_some_and(|value| {
        ["dependencies", "devDependencies", "peerDependencies"]
            .iter()
            .any(|field| truthy(&value[field]["packageName"]))
    });
    let Some(package) = package.filter(|value| truthy(&value["name"])) else {
        return Ok(fallback.then(
            || json!({"name":name,"componentIdentity":null,"concreteVersion":null}),
        ));
    };
    let name = package["name"].as_str().ok_or_else(|| invalid("dependency package name"))?;
    let mut concrete = optional_string(package.get("version"))?;
    let identity = if let Some(id) = package.get("componentId").filter(|value| truthy(value)) {
        let identity = identity(id)?;
        let version = optional_string(id.get("version"))?;
        if concrete.is_some_and(|version| !version.is_empty())
            && version.is_some_and(|version| {
                !version.is_empty() && !matches!(version, "latest" | "head")
            })
        {
            concrete = version;
        }
        Some(identity)
    } else {
        None
    };
    Ok(Some(json!({"name":name,"componentIdentity":identity,"concreteVersion":concrete})))
}
fn identity(value: &Value) -> io::Result<String> {
    let name = value["name"]
        .as_str()
        .filter(|value| !value.is_empty())
        .ok_or_else(|| invalid("package component name"))?;
    let scope = value["scope"]
        .as_str()
        .filter(|value| !value.is_empty())
        .ok_or_else(|| invalid("package component scope"))?;
    let version = optional_string(value.get("version"))?;
    Ok(
        match version.filter(|version| {
            !version.is_empty() && !matches!(*version, "latest" | "head")
        }) {
            Some(version) => format!("{scope}/{name}@{version}"),
            None => format!("{scope}/{name}"),
        },
    )
}
fn optional_string(value: Option<&Value>) -> io::Result<Option<&str>> {
    match value {
        None | Some(Value::Null) => Ok(None),
        Some(Value::String(value)) => Ok(Some(value)),
        _ => Err(invalid("dependency package version")),
    }
}
fn truthy(value: &Value) -> bool {
    match value {
        Value::Null => false,
        Value::Bool(value) => *value,
        Value::Number(value) => value.as_f64() != Some(0.0),
        Value::String(value) => !value.is_empty(),
        Value::Object(_) | Value::Array(_) => true,
    }
}
