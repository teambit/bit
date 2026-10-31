use std::io;

use super::{choose, get, insert, invalid, object};
use crate::js_json::Value;

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

fn detached(value: &Value) -> io::Result<Value> {
    object(value)?;
    let mut output = Value::Object(Vec::new());
    for name in ["heads", "deleted"] {
        let Value::Array(values) = get(value, name) else {
            return Err(invalid("detached refs required"));
        };
        if values.len() > 4096 {
            return Err(invalid("detached refs limit"));
        }
        insert(
            &mut output,
            name,
            if values.is_empty() { Value::Undefined } else { Value::Array(values.clone()) },
        );
    }
    insert(&mut output, "current", get(value, "current").clone());
    if get(&output, "heads").truthy()?
        || get(&output, "deleted").truthy()?
        || get(&output, "current").truthy()?
    {
        Ok(output)
    } else {
        Ok(Value::Undefined)
    }
}

pub(super) fn lane(fields: &Value) -> io::Result<Value> {
    let Value::Array(components) = get(fields, "components") else {
        return Err(invalid("lane components required"));
    };
    if components.len() > 65536 {
        return Err(invalid("lane components limit"));
    }
    let components = components
        .iter()
        .map(lane_component_row)
        .collect::<io::Result<Vec<_>>>()?;
    let mut output = Vec::new();
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
            "components" => Value::Array(components.clone()),
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
    insert(&mut output, "graphCompleteRefs", get(fields, "graphCompleteRefs").clone());
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
