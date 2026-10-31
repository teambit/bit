#[cfg(test)]
mod tests;

use super::{super::invalid, projection};
use serde_json::{Value, json};
use std::io;

pub(super) fn merge(
    identity: &str,
    versions: &[Value; 3],
    current: &Value,
    workspace: &Value,
    strategy: Option<&str>,
    semver: &Value,
    labels: &Value,
) -> io::Result<(Value, Value)> {
    let entries = projection::entries;
    let input = json!({"compIdStr":identity,"current":entries(current)?,
        "base":entries(&versions[0]["extensions"])?,
        "other":entries(&versions[2]["extensions"])?,
        "coreNames":projection::configuration_cores(),"workspaceIds":workspace,"otherLaneIds":[],
        "strategy":strategy,"currentLabel":labels["current"],"otherLabel":labels["other"],
        "semver":semver,"shouldMergeAspectsData":false});
    let result = crate::config_merge::apply("configComponent", &input)?;
    let mut merged = merged_config(&input, &result)?;
    scope_policy(
        &mut merged,
        &versions[if strategy == Some("theirs") { 2 } else { 1 }]["extensions"],
    )?;
    Ok((merged, json!({"input":input,"result":result})))
}

fn merged_config(input: &Value, result: &Value) -> io::Result<Value> {
    let mut merged = serde_json::Map::new();
    for row in projection::array(&result["configRows"])? {
        let Some(value) = row.get("merged") else { continue };
        let config = resolve(input, value)?;
        let id = row["id"]
            .as_str()
            .map(str::trim)
            .filter(|id| !id.is_empty())
            .ok_or_else(|| invalid("command merged config identity"))?;
        if !config.is_null() && config != false {
            merged.insert(id.to_owned(), config);
        }
    }
    Ok(Value::Object(merged))
}

pub(super) fn resolve(input: &Value, value: &Value) -> io::Result<Value> {
    if let Some(value) = value.get("value") {
        return Ok(value.clone());
    }
    let side = value["source"]["side"]
        .as_str()
        .map(str::trim)
        .ok_or_else(|| invalid("command config source"))?;
    let index = value["source"]["index"]
        .as_u64()
        .ok_or_else(|| invalid("command config source index"))? as usize;
    if !["current", "base", "other"].contains(&side) {
        return Err(invalid("command config source side"));
    }
    input[side]
        .get(index)
        .and_then(|row| row.get("config"))
        .cloned()
        .ok_or_else(|| invalid("command config source entry"))
}

fn scope_policy(merged: &mut Value, current: &Value) -> io::Result<()> {
    let Some(policy) = merged
        .get_mut(projection::RESOLVER)
        .and_then(|resolver| resolver.get_mut("policy"))
    else {
        return Ok(());
    };
    let original = policy
        .as_object()
        .ok_or_else(|| invalid("command merged policy"))?
        .clone();
    let fields = policy_fields(&original)?;
    let scope = scope_fields(current)?;
    let plan =
        crate::config_merge::apply("configScopePolicy", &json!({"merged":fields,"scope":scope}))?;
    let object = policy.as_object_mut().ok_or_else(|| invalid("command merged policy"))?;
    for field in projection::array(&plan["fields"])? {
        let name = field["field"].as_str().ok_or_else(|| invalid("command policy field"))?;
        if field["delete"] == true {
            object.remove(name);
            continue;
        }
        let existing = original.get(name).unwrap_or(&Value::Null);
        let rows = projection::array(&field["retain"])?
            .iter()
            .map(|entry| retained_policy_row(existing, field, entry))
            .collect::<io::Result<Vec<_>>>()?;
        object.insert(name.into(), json!(rows));
    }
    Ok(())
}

fn retained_policy_row(original: &Value, field: &Value, entry: &Value) -> io::Result<Value> {
    if let Some(index) = entry["original"].as_u64() {
        return original
            .get(index as usize)
            .cloned()
            .ok_or_else(|| invalid("command original policy row"));
    }
    entry["appended"]
        .as_u64()
        .and_then(|index| field["append"].get(index as usize))
        .cloned()
        .ok_or_else(|| invalid("command appended policy row"))
}

fn policy_fields(original: &serde_json::Map<String, Value>) -> io::Result<Vec<Value>> {
    original
        .iter()
        .map(|(field, rows)| {
            let entries = projection::array(rows)?
                .iter()
                .map(|row| json!({"name":row["name"],"version":row["version"]}))
                .collect::<Vec<_>>();
            Ok(json!({"field":field,"entries":entries}))
        })
        .collect::<io::Result<Vec<_>>>()
}

fn scope_fields(current: &Value) -> io::Result<Vec<Value>> {
    let scope = projection::array(current)?
        .iter()
        .find(|row| row["name"] == projection::RESOLVER)
        .and_then(|row| row["config"]["policy"].as_object());
    scope.into_iter().flatten().map(|(field, values)| {
        let values = values.as_object().ok_or_else(|| invalid("command scope policy map"))?;
        Ok(json!({"field":field,"entries":values.iter().map(|(name,version)| json!({"name":name,"version":version})).collect::<Vec<_>>()}))
    }).collect::<io::Result<Vec<_>>>()
}

pub(super) fn automatic(merged: &Value) -> io::Result<Value> {
    ["dependencies", "devDependencies", "peerDependencies"]
        .iter()
        .map(|field| selected_policy(&merged[projection::RESOLVER]["policy"][*field], false))
        .collect::<io::Result<Vec<_>>>()
        .map(Value::Array)
}

fn selected_policy(value: &Value, forced: bool) -> io::Result<Value> {
    let mut output = serde_json::Map::new();
    for row in value.as_array().into_iter().flatten() {
        if (row["force"] == true) != forced {
            continue;
        }
        let name = row["name"]
            .as_str()
            .map(str::trim)
            .filter(|name| !name.is_empty())
            .ok_or_else(|| invalid("command policy name"))?;
        if !row["version"].is_string() {
            return Err(invalid("command policy version"));
        }
        output.insert(name.to_owned(), row["version"].clone());
    }
    Ok(Value::Object(output))
}

pub(super) fn normalized(merged: &Value) -> io::Result<Value> {
    let mut output = merged.clone();
    let Some(policy) = output
        .get_mut(projection::RESOLVER)
        .and_then(|resolver| resolver.get_mut("policy"))
        .and_then(Value::as_object_mut)
    else {
        return Ok(output);
    };
    for field in ["dependencies", "devDependencies", "peerDependencies"] {
        let Some(value) = policy.get(field).filter(|value| value.is_array()) else {
            continue;
        };
        let forced = selected_policy(value, true)?;
        let forced = forced
            .as_object()
            .ok_or_else(|| invalid("command forced policy"))?
            .clone();
        if forced.is_empty() {
            policy.remove(field);
        } else {
            policy.insert(field.to_owned(), Value::Object(forced));
        }
    }
    Ok(output)
}
