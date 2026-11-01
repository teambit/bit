use super::{array, invalid, text, validate};
use serde_json::{Value, json};
use std::io;

pub(super) fn plan(input: &Value) -> io::Result<Value> {
    validate::fields(input, &["merged", "scope"])?;
    let merged = array(input, "merged")?;
    let scope = input
        .get("scope")
        .map(|_| array(input, "scope"))
        .transpose()?
        .unwrap_or(&[]);
    fields(merged)?;
    fields(scope)?;
    let mut output = Vec::with_capacity(merged.len() + scope.len());
    for field in merged {
        let field_name = field["field"].as_str().map(str::trim);
        output.push(one(
            field,
            scope
                .iter()
                .find(|entry| entry["field"].as_str().map(str::trim) == field_name),
        )?);
    }
    for field in scope {
        let field_name = field["field"].as_str().map(str::trim);
        if !merged
            .iter()
            .any(|entry| entry["field"].as_str().map(str::trim) == field_name)
        {
            output.push(one(&json!({"field":field["field"],"entries":[]}), Some(field))?);
        }
    }
    let order = scope
        .iter()
        .map(|field| field["field"].clone())
        .collect::<Vec<_>>();
    Ok(json!({"fields":output,"appendOrder":order}))
}
fn fields(input: &[Value]) -> io::Result<()> {
    let mut names = Vec::with_capacity(input.len());
    for field in input {
        validate::fields(field, &["field", "entries"])?;
        let name = text(field, "field")?.trim();
        if name.is_empty()
            || names.contains(&name)
            || ["__proto__", "constructor", "prototype"].contains(&name)
        {
            return Err(invalid("scope policy field"));
        }
        names.push(name);
        for entry in array(field, "entries")? {
            validate_entry(entry)?;
        }
    }
    Ok(())
}
fn validate_entry(entry: &Value) -> io::Result<()> {
    validate::fields(entry, &["name", "version", "force"])?;
    if text(entry, "name")?.trim().is_empty() || text(entry, "version")?.trim().is_empty() {
        return Err(invalid("scope policy entry"));
    }
    if entry
        .get("force")
        .is_some_and(|force| !force.is_boolean())
    {
        return Err(invalid("scope policy force"));
    }
    Ok(())
}
fn one(merged: &Value, scope: Option<&Value>) -> io::Result<Value> {
    let originals = array(merged, "entries")?;
    let entries = scope
        .map(|scope| array(scope, "entries"))
        .transpose()?
        .unwrap_or(&[]);
    let mut append = Vec::new();
    for entry in entries {
        let entry_name = entry["name"].as_str().map_or("", str::trim);
        let entry_version = entry["version"].as_str().map_or("", str::trim);
        if originals
            .iter()
            .chain(append.iter())
            .any(|existing| existing["name"].as_str().map(str::trim) == Some(entry_name))
        {
            continue;
        }
        let force = entry["force"].as_bool().unwrap_or(true);
        append.push(json!({"name":entry_name,"version":entry_version,"force":force}));
    }
    let mut retain = Vec::new();
    for (index, entry) in originals.iter().enumerate() {
        if entry["version"].as_str().map(str::trim) != Some("-") {
            retain.push(json!({"original":index}));
        }
    }
    for (index, entry) in append.iter().enumerate() {
        if entry["version"].as_str().map(str::trim) != Some("-") {
            retain.push(json!({"appended":index}));
        }
    }
    Ok(json!({"field":merged["field"],"append":append,"delete":retain.is_empty(),"retain":retain}))
}
