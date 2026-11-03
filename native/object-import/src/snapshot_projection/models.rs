//! Canonical field ordering and projection ([`component`], [`lane`], [`detached`], [`history`]) for `Component`, `Lane`, and `VersionHistory` [`Value`] objects.

use std::io;

use super::{choose, get, insert, invalid, object};
use crate::js_json::Value;

/// Projects raw `Component` `fields` into their canonical snapshot object representation (including [`detached`]).
pub(super) fn component(fields: &Value) -> io::Result<Value> {
    let mut output = choose(
        fields,
        &[
            "name",
            "scope",
            "versions",
            "lang",
            "deprecated",
            "bindingPrefix",
            "remotes",
            "schema",
            "detachedHeads",
        ],
        false,
    )?;
    component_fields(&mut output, fields)?;
    if get(fields, "local").truthy()? {
        insert(&mut output, "local", get(fields, "local").clone());
    }
    for name in ["state", "orphanedVersions"] {
        if !get(fields, name).empty()? {
            insert(&mut output, name, get(fields, name).clone());
        }
    }
    if get(fields, "head").truthy()? {
        insert(&mut output, "head", get(fields, "head").clone());
    }
    Ok(output)
}

/// Projects the `detachedHeads` object (`heads`, `deleted`, `current`), returning [`Value::Undefined`] when empty.
fn detached(value: &Value) -> io::Result<Value> {
    object(value)?;
    let mut output = Value::Object(Vec::with_capacity(3));
    let mut active = false;
    for name in ["heads", "deleted"] {
        let Value::Array(values) = get(value, name) else {
            return Err(invalid("detached refs required"));
        };
        if values.len() > 4096 {
            return Err(invalid("detached refs limit"));
        }
        let entry = if values.is_empty() {
            Value::Undefined
        } else {
            active = true;
            Value::Array(values.clone())
        };
        insert(&mut output, name, entry);
    }
    let current = get(value, "current");
    if current.truthy()? {
        active = true;
    }
    insert(&mut output, "current", current.clone());
    Ok(if active { output } else { Value::Undefined })
}

/// Projects raw `Lane` `fields` into their canonical snapshot object representation.
pub(super) fn lane(fields: &Value) -> io::Result<Value> {
    let Value::Array(components) = get(fields, "components") else {
        return Err(invalid("lane components required"));
    };
    if components.len() > 65536 {
        return Err(invalid("lane components limit"));
    }
    let mut components = Some(Value::Array(
        components
            .iter()
            .map(lane_component_row)
            .collect::<io::Result<Vec<_>>>()?,
    ));
    let mut output = Vec::with_capacity(9);
    for name in [
        "name",
        "scope",
        "components",
        "log",
        "readmeComponent",
        "forkedFrom",
        "schema",
        "updateDependents",
        "overrideUpdateDependents",
    ] {
        let value = match name {
            "components" => components.take().unwrap_or(Value::Undefined),
            "readmeComponent" if get(fields, name).truthy()? => readme(get(fields, name))?,
            _ => get(fields, name).clone(),
        };
        if value.truthy()? {
            output.push((name.encode_utf16().collect(), value));
        }
    }
    Ok(Value::Object(output))
}

fn lane_component_row(row: &Value) -> io::Result<Value> {
    object(row)?;
    let mut component = Value::Object(vec![
        ("id".encode_utf16().collect(), choose(get(row, "id"), &["scope", "name"], false)?),
        ("head".encode_utf16().collect(), get(row, "head").clone()),
    ]);
    if get(row, "isDeleted").truthy()? {
        insert(&mut component, "isDeleted", get(row, "isDeleted").clone());
    }
    Ok(component)
}

fn readme(fields: &Value) -> io::Result<Value> {
    object(fields)?;
    let mut output = Value::Object(vec![(
        "id".encode_utf16().collect(),
        choose(get(fields, "id"), &["scope", "name"], false)?,
    )]);
    let head = get(fields, "head");
    insert(
        &mut output,
        "head",
        if matches!(head, Value::Undefined | Value::Null) { Value::Null } else { head.clone() },
    );
    Ok(output)
}

pub(super) fn history(fields: &Value) -> io::Result<Value> {
    let Value::Array(versions) = get(fields, "versions") else {
        return Err(invalid("history versions required"));
    };
    if versions.len() > 65536 {
        return Err(invalid("history versions limit"));
    }
    let rows = versions
        .iter()
        .map(|row| {
            object(row)?;
            choose(row, &["hash", "parents", "unrelated", "squashed"], false)
        })
        .collect::<io::Result<Vec<_>>>()?;
    let mut output = choose(fields, &["name", "scope"], false)?;
    insert(&mut output, "versions", Value::Array(rows));
    let graph_refs = get(fields, "graphCompleteRefs");
    if let Value::Array(refs) = graph_refs
        && refs.len() > 65536
    {
        return Err(invalid("history graphCompleteRefs limit"));
    }
    insert(&mut output, "graphCompleteRefs", graph_refs.clone());
    Ok(output)
}

fn component_fields(output: &mut Value, fields: &Value) -> io::Result<()> {
    let Value::Object(projected) = output else {
        unreachable!("created object");
    };
    for (key, value) in projected {
        if key
            .iter()
            .copied()
            .eq("remotes".encode_utf16())
        {
            *value = get(fields, "scopesList").clone();
        }
        if key
            .iter()
            .copied()
            .eq("detachedHeads".encode_utf16())
        {
            *value = detached(get(fields, "detachedHeads"))?;
        }
    }
    Ok(())
}
