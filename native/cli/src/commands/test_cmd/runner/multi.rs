//! Aggregate built-in Jest results for multiple selected components.
mod ownership;
use super::{config, invalid, report, settings::Settings, summary};
use crate::commands::workspace_command::{component_service::Component, results::Report};
use serde_json::{Value, json};
use std::{io, path::Path};

pub(super) fn request(
    root: &Path,
    components: &[Component],
    environment: &str,
    settings: &Settings,
) -> io::Result<Option<Value>> {
    ownership::validate(root, components)?;
    let mut combined: Option<Value> = None;
    let mut has_tests = false;
    for component in components {
        let (request, component_has_tests) =
            config::request_with_empty(root, component, environment, settings)?;
        validate_patterns(root, component, &request)?;
        has_tests |= component_has_tests;
        if let Some(target) = &mut combined {
            merge(target, &request)?;
        } else {
            combined = Some(request);
        }
    }
    Ok(combined.filter(|_| has_tests))
}
fn validate_patterns(root: &Path, component: &Component, request: &Value) -> io::Result<()> {
    let prefix = root
        .join(&component.directory)
        .to_string_lossy()
        .replace('\\', "/");
    let patterns = request["config"]["testMatch"]
        .as_array()
        .ok_or_else(|| invalid("tester match patterns"))?;
    for pattern in patterns {
        let pattern = pattern
            .as_str()
            .ok_or_else(|| invalid("tester match pattern"))?
            .replace('\\', "/");
        let relative = pattern
            .strip_prefix(&prefix)
            .and_then(|value| value.strip_prefix('/'))
            .ok_or_else(|| invalid("tester unconfined multi-component pattern"))?;
        if relative
            .split('/')
            .any(|part| part == "..")
        {
            return Err(invalid("tester unconfined multi-component pattern"));
        }
    }
    Ok(())
}

fn merge(target: &mut Value, source: &Value) -> io::Result<()> {
    let patterns =
        source["config"]["testMatch"].as_array().ok_or_else(|| invalid("tester match patterns"))?;
    target["config"]["testMatch"]
        .as_array_mut()
        .ok_or_else(|| invalid("tester match patterns"))?
        .extend(patterns.iter().cloned());
    if let Some(ignored) = source["config"]["coveragePathIgnorePatterns"].as_array() {
        let target = target["config"]["coveragePathIgnorePatterns"]
            .as_array_mut()
            .ok_or_else(|| invalid("tester coverage patterns"))?;
        for value in ignored
            .iter()
            .skip(1)
            .take(ignored.len().saturating_sub(2))
        {
            if !target.contains(value) {
                target.insert(target.len() - 1, value.clone());
            }
        }
    }
    Ok(())
}

pub(super) fn report_summary(
    root: &Path,
    raw: &Value,
    components: &[Component],
    identities: &[String],
    environment: &str,
) -> io::Result<Report> {
    let mut output = report::report(raw, &identities[0])?;
    if raw.get("terminated").is_some() {
        return Ok(output);
    }
    let rows = raw["results"]["testResults"]
        .as_array()
        .map_or(&[][..], Vec::as_slice);
    if rows
        .iter()
        .any(|row| {
            components
                .iter()
                .filter(|component| belongs(root, component, row))
                .count()
                != 1
        })
    {
        return Err(invalid("tester result ownership"));
    }
    let mut aggregate = json!({"totals":{"totalComponents":0,"tested":0,"withoutTests":0,
        "affectedByEnvError":0,"testsPassed":0,"testsFailed":0,"testsPending":0},
        "componentsWithTests":[],"componentsWithoutTests":[],"componentsAffectedByEnvError":[],"envErrors":[]});
    for (component, identity) in components.iter().zip(identities) {
        let mut result = raw.clone();
        if result.get("results").is_some() {
            result["results"]["testResults"] = Value::Array(
                rows.iter()
                    .filter(|row| belongs(root, component, row))
                    .cloned()
                    .collect(),
            );
        }
        let report = report::report(&result, identity)?;
        let data =
            summary::render(&report.data, identity, environment, result["errorMessage"].as_str())?;
        combine(&mut aggregate, &serde_json::from_str::<Value>(&data)?);
    }
    output.data = serde_json::to_string_pretty(&aggregate)?;
    Ok(output)
}
fn belongs(root: &Path, component: &Component, row: &Value) -> bool {
    row["testFilePath"]
        .as_str()
        .is_some_and(|name| {
            super::paths::normalized(Path::new(name))
                .starts_with(super::paths::normalized(&root.join(&component.directory)))
        })
}
fn combine(target: &mut Value, source: &Value) {
    for field in [
        "totalComponents",
        "tested",
        "withoutTests",
        "affectedByEnvError",
        "testsPassed",
        "testsFailed",
        "testsPending",
    ] {
        target["totals"][field] = json!(
            target["totals"][field].as_u64().unwrap() + source["totals"][field].as_u64().unwrap()
        );
    }
    for field in ["componentsWithTests", "componentsWithoutTests", "componentsAffectedByEnvError"] {
        target[field]
            .as_array_mut()
            .unwrap()
            .extend(
                source[field]
                    .as_array()
                    .unwrap()
                    .iter()
                    .cloned(),
            );
    }
    if target["envErrors"]
        .as_array()
        .unwrap()
        .is_empty()
    {
        target["envErrors"] = source["envErrors"].clone();
    }
}
