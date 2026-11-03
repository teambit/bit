//! Aggregate released tester JSON into the versionless component summary.
//!
//! [`project`] normalizes component test [`Value`] results into versionless summary payloads via [`component`] and [`env_errors`].
use serde_json::{Value, json};

/// Projects single-component tester JSON `data` ([`Value`]) for `identity` and `environment` into a versionless summary [`Value`].
fn project(data: &Value, identity: &str, environment: &str, message: Option<&str>) -> Value {
    let identity = identity
        .trim()
        .split('@')
        .next()
        .unwrap_or_default()
        .trim();
    let tested: Vec<_> = data[0]["data"]["components"]
        .as_array()
        .map_or(&[][..], Vec::as_slice)
        .iter()
        .filter_map(component)
        .collect();
    let environment_error = data[0]
        .get("error")
        .is_some_and(|error| !error.is_null());
    let without = if tested.is_empty() && !environment_error { vec![identity] } else { Vec::new() };
    let affected = if tested.is_empty() && environment_error { vec![identity] } else { Vec::new() };
    let errors = env_errors(environment_error, environment, message);
    let (tests_passed, tests_failed, tests_pending) =
        sum_triple(&tested, ["passed", "failed", "pending"]);
    json!({"totals":{"totalComponents":1,"tested":tested.len(),"withoutTests":without.len(),
        "affectedByEnvError":affected.len(),"testsPassed":tests_passed,
        "testsFailed":tests_failed,"testsPending":tests_pending},
        "componentsWithTests":tested,"componentsWithoutTests":without,
        "componentsAffectedByEnvError":affected,"envErrors":errors})
}

/// Builds the `envErrors` summary array when `environment_error` is `true`.
#[inline]
fn env_errors(environment_error: bool, environment: &str, message: Option<&str>) -> Vec<Value> {
    if !environment_error {
        return Vec::new();
    }
    let mut error = json!({"envId":environment.trim()});
    if let Some(message) = message
        .map(str::trim)
        .filter(|msg| !msg.is_empty())
    {
        error["message"] = json!(message);
    }
    vec![error]
}

/// Summarizes a single component row from `components` into `{ id, passed, failed, pending, hasError }`.
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
    let (passed, failed, pending) = sum_triple(files, ["pass", "failed", "pending"]);
    Some(json!({"id":identity,"passed":passed,"failed":failed,
        "pending":pending,"hasError":has_error}))
}

/// Returns a trimmed non-empty string slice when `val` is a non-blank JSON string.
#[inline]
fn non_empty_str(val: &Value) -> Option<&str> {
    val.as_str()
        .map(str::trim)
        .filter(|text| !text.is_empty())
}

/// Extracts the versionless `<scope>/<name>` identity from a string or legacy object `id` [`Value`].
#[inline]
fn component_identity(id: &Value) -> Option<String> {
    if let Some(raw) = non_empty_str(id) {
        let bare = bit_install::config::aspect_id_without_version(raw).trim();
        return (!bare.is_empty()).then(|| bare.to_owned());
    }
    let scope = non_empty_str(&id["_legacy"]["scope"])
        .or_else(|| non_empty_str(&id["_scope"]))
        .or_else(|| non_empty_str(&id["scope"]))?;
    let name = non_empty_str(&id["_legacy"]["name"]).or_else(|| non_empty_str(&id["name"]))?;
    Some(format!("{scope}/{name}"))
}

/// Sums the three numeric `fields` across all JSON objects in `rows`.
#[inline]
fn sum_triple(rows: &[Value], fields: [&str; 3]) -> (u64, u64, u64) {
    rows.iter()
        .fold((0, 0, 0), |(first, second, third), row| {
            (
                first + row[fields[0]].as_u64().unwrap_or(0),
                second + row[fields[1]].as_u64().unwrap_or(0),
                third + row[fields[2]].as_u64().unwrap_or(0),
            )
        })
}

#[inline]
pub(super) fn render(
    data: &str,
    identity: &str,
    environment: &str,
    message: Option<&str>,
) -> std::io::Result<String> {
    let data = serde_json::from_str(data)?;
    Ok(serde_json::to_string_pretty(&project(&data, identity, environment, message))?)
}
