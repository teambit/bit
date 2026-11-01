use std::io;

use super::{component_id, get, invalid, object, text};
use crate::js_json::Value;

/// Sort and filter extension configurations for semantic `Version` hashing.
pub(super) fn configs(value: &Value) -> io::Result<(Value, Vec<(usize, Value)>)> {
    let Value::Array(entries) = value else {
        return Err(invalid("extensions required"));
    };
    if entries.len() > 4096 {
        return Err(invalid("extensions limit"));
    }
    let mut rows = entries
        .iter()
        .enumerate()
        .map(|(index, row)| Ok((id(row)?.encode_utf16().collect::<Vec<_>>(), index, row)))
        .collect::<io::Result<Vec<_>>>()?;
    rows.sort_by(|left, right| left.0.cmp(&right.0));
    let mut output = Vec::with_capacity(rows.len());
    let mut assignments = Vec::with_capacity(rows.len());
    for (id, index, row) in rows {
        let sorted = sorted_config(get(row, "rawConfig"))?;
        let config = without_internal(&sorted)?;
        if !config.empty()? {
            output.push(Value::Object(vec![
                ("id".encode_utf16().collect(), Value::String(id)),
                ("config".encode_utf16().collect(), config),
            ]));
        }
        assignments.push((index, sorted));
    }
    Ok((Value::Array(output), assignments))
}

fn sorted_config(value: &Value) -> io::Result<Value> {
    if matches!(value,Value::String(units) if units.as_slice()==[u16::from(b'-')]) {
        return Ok(Value::Object(Vec::new()));
    }
    let fields = object(value)?;
    if fields
        .iter()
        .any(|(key, _)| {
            key.iter()
                .copied()
                .eq("__proto__".encode_utf16())
        })
    {
        return Err(invalid("prototype config sorter requires canonical fallback"));
    }
    let mut sorted = fields.to_vec();
    sorted.sort_unstable_by(|left, right| left.0.cmp(&right.0));
    Ok(Value::Object(sorted))
}

pub(super) fn dependencies(value: &Value) -> io::Result<Value> {
    let Value::Array(entries) = value else {
        return Err(invalid("extensions required"));
    };
    if entries.len() > 4096 {
        return Err(invalid("extensions limit"));
    }
    let mut output = Vec::with_capacity(entries.len());
    for row in entries {
        object(row)?;
        let id = get(row, "extensionId");
        if id.truthy()? {
            output.push(Value::Object(vec![(
                "id".encode_utf16().collect(),
                Value::text(&component_id(id)?),
            )]));
        }
    }
    Ok(Value::Array(output))
}

fn id(row: &Value) -> io::Result<String> {
    object(row)?;
    for key in ["extensionId", "name", "legacyId"] {
        let field = get(row, key);
        if field.truthy()? {
            let resolved = component_id(field).or_else(|_| text(field))?;
            return Ok(resolved.trim().to_owned());
        }
    }
    Ok(String::new())
}

fn without_internal(value: &Value) -> io::Result<Value> {
    let Value::Object(fields) = value else {
        return Err(invalid("sorted config object"));
    };
    let mut output = Vec::with_capacity(fields.len());
    for (key, entry) in fields {
        if !key
            .iter()
            .copied()
            .eq("__specific".encode_utf16())
        {
            output.push((key.clone(), entry.clone()));
        }
    }
    Ok(Value::Object(output))
}
