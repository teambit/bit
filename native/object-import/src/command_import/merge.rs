//! Apply the same import decisions used by the canonical mutable-object writer.
#[cfg(test)]
mod tests;
use super::invalid;
use serde_json::{Value, json};
use std::io;

/// `mergeOne(incoming, isIncomingFromOrigin, existing)`. A model a remote
/// serves from its cache of a dependent's dependencies is not from its origin:
/// its tags become orphaned versions and its head is not taken.
pub(super) fn model_from(
    existing: Option<&Value>,
    incoming: &Value,
    origin: bool,
) -> io::Result<Value> {
    let incoming = parsed_model(incoming)?;
    let incoming = &incoming;
    let Some(existing) = existing else { return canonical(incoming) };
    let existing = parsed_model(existing)?;
    let existing = &existing;
    if existing["name"] != incoming["name"] || existing["scope"] != incoming["scope"] {
        return Err(invalid("import model identity mismatch"));
    }
    if existing["head"] == incoming["head"]
        && existing["versions"] == incoming["versions"]
        && entries(&existing["orphanedVersions"])? == entries(&incoming["orphanedVersions"])?
    {
        return canonical(incoming);
    }
    let MergePlan { plan, tags, heads, deleted, local } = plan(existing, incoming, origin)?;
    let mut result = existing.clone();
    if result.get("orphanedVersions").is_none() {
        result["orphanedVersions"] = json!({});
    }
    apply_tags(&mut result, &tags, &plan)?;
    if origin
        && local.is_empty()
        && let Some(head) = incoming["head"]
            .as_str()
            .map(str::trim)
            .filter(|head| !head.is_empty())
    {
        result["head"] = json!(head);
    }
    apply_detached(&mut result, &heads, &deleted, &plan)?;
    if result["orphanedVersions"].as_object().is_some_and(serde_json::Map::is_empty) {
        result
            .as_object_mut()
            .ok_or_else(|| invalid("import model"))?
            .shift_remove("orphanedVersions");
    }
    canonical(&result)
}
struct MergePlan {
    plan: Value,
    tags: [Vec<[String; 2]>; 3],
    heads: [Vec<String>; 2],
    deleted: [Vec<String>; 2],
    local: Vec<String>,
}
fn plan(existing: &Value, incoming: &Value, origin: bool) -> io::Result<MergePlan> {
    let local: Vec<_> = existing["state"]["versions"]
        .as_object()
        .into_iter()
        .flatten()
        .filter(|(_, value)| value["local"] == true)
        .map(|(key, _)| key.clone())
        .collect();
    let tags = [
        entries(&existing["versions"])?,
        entries(&incoming["versions"])?,
        entries(&incoming["orphanedVersions"])?,
    ];
    let heads =
        [array(&existing["detachedHeads"]["heads"])?, array(&incoming["detachedHeads"]["heads"])?];
    let deleted = [
        array(&existing["detachedHeads"]["deleted"])?,
        array(&incoming["detachedHeads"]["deleted"])?,
    ];
    let plan =
        crate::operation::plan(json!({"kind":"component","existing":tags[0],"incoming":tags[1],
        "orphaned":tags[2],"local":local,"origin":origin,"heads":heads,"deleted":deleted}))?;
    if plan["conflicts"]
        .as_array()
        .is_none_or(|items| !items.is_empty())
    {
        return Err(invalid("import model tag conflict"));
    }
    Ok(MergePlan { plan, tags, heads, deleted, local })
}
fn apply_tags(result: &mut Value, tags: &[Vec<[String; 2]>; 3], plan: &Value) -> io::Result<()> {
    for action in plan["actions"].as_array().ok_or_else(|| invalid("import model actions"))? {
        let side = action[1].as_u64().ok_or_else(|| invalid("import model side"))? as usize;
        let index = action[2].as_u64().ok_or_else(|| invalid("import model index"))? as usize;
        let [tag, hash] = tags
            .get(side)
            .and_then(|rows| rows.get(index))
            .ok_or_else(|| invalid("import tag action"))?;
        match action[0].as_str() {
            Some("remove") => {
                result["versions"]
                    .as_object_mut()
                    .ok_or_else(|| invalid("import tags"))?
                    .shift_remove(tag);
                result["orphanedVersions"][tag] = json!(hash);
            }
            Some("tag") => result["versions"][tag] = json!(hash),
            Some("orphan") => result["orphanedVersions"][tag] = json!(hash),
            _ => return Err(invalid("import model action")),
        }
    }
    Ok(())
}
fn apply_detached(
    result: &mut Value,
    heads: &[Vec<String>; 2],
    deleted: &[Vec<String>; 2],
    plan: &Value,
) -> io::Result<()> {
    for (field, sources) in [("heads", heads), ("deleted", deleted)] {
        let selected =
            plan[field].as_array().ok_or_else(|| invalid("import detached selection"))?;
        let values: Vec<_> = selected
            .iter()
            .map(|row| {
                let side = row[0].as_u64().ok_or_else(|| invalid("import detached side"))? as usize;
                let index =
                    row[1].as_u64().ok_or_else(|| invalid("import detached index"))? as usize;
                sources
                    .get(side)
                    .and_then(|values| values.get(index))
                    .cloned()
                    .ok_or_else(|| invalid("import detached value"))
            })
            .collect::<io::Result<_>>()?;
        if !values.is_empty() || result["detachedHeads"].get(field).is_some() {
            result["detachedHeads"][field] = json!(values);
        }
    }
    Ok(())
}
fn canonical(value: &Value) -> io::Result<Value> {
    let mut result = json!({});
    for key in [
        "name",
        "scope",
        "versions",
        "lang",
        "deprecated",
        "bindingPrefix",
        "remotes",
        "schema",
        "detachedHeads",
        "local",
        "state",
        "orphanedVersions",
        "head",
    ] {
        if let Some(field) = value.get(key) {
            result[key] = field.clone();
        }
    }
    Ok(result)
}
fn parsed_model(value: &Value) -> io::Result<Value> {
    let mut result = value.clone();
    if (result["schema"].is_null() || result["schema"] == "")
        && let Some(head) = result["head"]
            .as_str()
            .filter(|head| !head.is_empty())
    {
        crate::merge_history::hash(head)?;
        result["schema"] = json!("1.0.0");
    }
    validate_model(&result)?;
    Ok(result)
}

fn validate_model(value: &Value) -> io::Result<()> {
    if value["name"].as_str().is_none()
        || value["scope"].as_str().is_none()
        || !matches!(value["schema"].as_str(), Some("1.0.0" | "2.0.0"))
        || !value["versions"].is_object()
    {
        return Err(invalid("import unsupported model identity"));
    }
    if value["lang"].as_str().is_none()
        || value["bindingPrefix"].as_str().is_none()
        || !value["deprecated"].is_boolean()
        || !value["remotes"].is_array()
    {
        return Err(invalid("import unsupported model schema"));
    }
    Ok(())
}
fn entries(value: &Value) -> io::Result<Vec<[String; 2]>> {
    if value.is_null() {
        return Ok(Vec::new());
    }
    value
        .as_object()
        .ok_or_else(|| invalid("import tag map"))?
        .iter()
        .map(|(tag, hash)| {
            let hash = hash
                .as_str()
                .map(str::trim)
                .ok_or_else(|| invalid("import tag hash"))?;
            crate::merge_history::hash(hash)?;
            Ok([tag.trim().to_owned(), hash.to_owned()])
        })
        .collect()
}
fn array(value: &Value) -> io::Result<Vec<String>> {
    if value.is_null() {
        return Ok(Vec::new());
    }
    value
        .as_array()
        .ok_or_else(|| invalid("import detached heads"))?
        .iter()
        .map(|value| {
            let hash = value
                .as_str()
                .map(str::trim)
                .ok_or_else(|| invalid("import detached hash"))?;
            crate::merge_history::hash(hash)?;
            Ok(hash.to_owned())
        })
        .collect()
}
