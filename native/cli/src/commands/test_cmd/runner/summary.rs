//! Aggregate released tester JSON into the versionless component summary.
use serde_json::{Value, json};

fn project(data: &Value, identity: &str, environment: &str, message: Option<&str>) -> Value {
    let identity = identity
        .split('@')
        .next()
        .unwrap_or(identity);
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
        let mut error = json!({"envId":environment});
        if let Some(message) = message {
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
    let identity = component["componentId"].as_str()?;
    let identity = identity
        .split('@')
        .next()
        .unwrap_or(identity);
    Some(json!({"id":identity,"passed":sum(files,"pass"),"failed":sum(files,"failed"),
        "pending":sum(files,"pending"),"hasError":errors||files.iter().any(|file|file.get("error").is_some())}))
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
