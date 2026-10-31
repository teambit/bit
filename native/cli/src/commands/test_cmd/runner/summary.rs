//! Aggregate released tester JSON into the versionless component summary.
use serde_json::{Value, json};

fn project(data: &Value, identity: &str, environment: &str, message: Option<&str>) -> Value {
    let trimmed_id = identity.trim();
    let identity = trimmed_id
        .split('@')
        .next()
        .unwrap_or(trimmed_id)
        .trim();
    let components = data[0]["data"]["components"]
        .as_array()
        .map_or(&[][..], Vec::as_slice);
    let tested: Vec<_> = components
        .iter()
        .filter_map(component)
        .collect();
    let environment_error = data[0]
        .get("error")
        .is_some_and(|error| !error.is_null());
    let without = if tested.is_empty() && !environment_error { vec![identity] } else { Vec::new() };
    let affected = if tested.is_empty() && environment_error { vec![identity] } else { Vec::new() };
    let mut errors = Vec::new();
    if environment_error {
        let mut error = json!({"envId":environment.trim()});
        if let Some(message) = message
            .map(str::trim)
            .filter(|msg| !msg.is_empty())
        {
            error["message"] = json!(message);
        }
        errors.push(error);
    }
    json!({"totals":{"totalComponents":1,"tested":tested.len(),"withoutTests":without.len(),
        "affectedByEnvError":affected.len(),"testsPassed":sum(&tested,"passed"),
        "testsFailed":sum(&tested,"failed"),"testsPending":sum(&tested,"pending")},
        "componentsWithTests":tested,"componentsWithoutTests":without,
        "componentsAffectedByEnvError":affected,"envErrors":errors})
}

fn component(component: &Value) -> Option<Value> {
    let files = component["results"]["testFiles"]
        .as_array()
        .map_or(&[][..], Vec::as_slice);
    let errors = component["errors"]
        .as_array()
        .is_some_and(|errors| !errors.is_empty());
    if files.is_empty() && !errors {
        return None;
    }
    let id = &component["componentId"];
    let identity = component_identity(id)?;
    let has_error = errors
        || files
            .iter()
            .any(|file| {
                file.get("error")
                    .is_some_and(|err| !err.is_null())
            });
    Some(json!({"id":identity,"passed":sum(files,"pass"),"failed":sum(files,"failed"),
        "pending":sum(files,"pending"),"hasError":has_error}))
}

fn non_empty_str(val: &Value) -> Option<&str> {
    val.as_str()
        .map(str::trim)
        .filter(|text| !text.is_empty())
}

fn component_identity(id: &Value) -> Option<String> {
    if let Some(raw) = non_empty_str(id) {
        let bare = raw
            .split('@')
            .next()
            .unwrap_or_default()
            .trim();
        return (!bare.is_empty()).then(|| bare.to_owned());
    }
    let scope = non_empty_str(&id["_legacy"]["scope"])
        .or_else(|| non_empty_str(&id["_scope"]))
        .or_else(|| non_empty_str(&id["scope"]))?;
    let name = non_empty_str(&id["_legacy"]["name"]).or_else(|| non_empty_str(&id["name"]))?;
    Some(format!("{scope}/{name}"))
}

fn sum(rows: &[Value], field: &str) -> u64 {
    rows.iter()
        .map(|row| row[field].as_u64().unwrap_or(0))
        .sum()
}

pub(super) fn render(
    data: &str,
    identity: &str,
    environment: &str,
    message: Option<&str>,
) -> std::io::Result<String> {
    let data = serde_json::from_str(data)?;
    Ok(serde_json::to_string_pretty(&project(&data, identity, environment, message))?)
}
