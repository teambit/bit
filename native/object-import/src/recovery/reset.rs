#[cfg(test)]
#[path = "reset_tests.rs"]
mod tests;

use super::invalid;
use serde_json::{Value, json};
use std::{collections::HashSet, io, path::Path};

const FIELDS: &[&str] = &[
    "objectsDirectory",
    "versions",
    "deletedRefs",
    "head",
    "laneHead",
    "common",
    "removeOnlyHead",
    "laneHidden",
    "laneNew",
    "hasScope",
    "laneHeadRemote",
    "laneHeadLocal",
    "tags",
    "orphaned",
    "detachedHeads",
    "detachedCurrent",
];

pub(super) fn plan(input: &Value) -> io::Result<Value> {
    validate(input)?;
    let change_head = deleted(input, optional(input, "head")?);
    let change_lane = deleted(input, optional(input, "laneHead")?);
    let selection = select(input, change_head || change_lane)?;
    let tags = tags_remaining(input)?;
    let keep = outcome(input, &selection, change_head, change_lane, tags)?;
    let retained: Vec<_> = array(input, "detachedHeads")?
        .iter()
        .enumerate()
        .filter_map(|(index, hash)| (!deleted(input, hash.as_str())).then_some(index))
        .collect();
    let mut output = json!({"changeHead":change_head,"changeLaneHead":change_lane,"removeLane":change_lane&&(selection.hash.is_none()||(selection.common&&optional(input,"laneHeadRemote")?.is_none())),"keepComponent":keep,"detachedRetained":retained,"clearDetachedCurrent":deleted(input,optional(input,"detachedCurrent")?)});
    if let Some(provenance) = selection.provenance {
        output["newHead"] = provenance;
    }
    Ok(output)
}
fn outcome(
    input: &Value,
    selection: &Selection,
    change_head: bool,
    change_lane: bool,
    tags: usize,
) -> io::Result<bool> {
    if change_lane
        && selection.hash.is_none()
        && input["laneNew"] == true
        && input["hasScope"] == true
    {
        return Err(invalid("reset exported new lane requires canonical callback"));
    }
    let head = if change_head { selection.hash.as_deref() } else { optional(input, "head")? };
    if optional(input, "head")?.is_some() && head.is_none() && tags != 0 {
        return Err(invalid("reset head removed while tags remain"));
    }
    let lane_local =
        if change_lane { selection.hash.as_deref() } else { optional(input, "laneHeadLocal")? };
    Ok(tags != 0 || head.is_some() || lane_local.is_some())
}

struct Selection {
    hash: Option<String>,
    provenance: Option<Value>,
    common: bool,
}
fn select(input: &Value, needed: bool) -> io::Result<Selection> {
    let none = Selection { hash: None, provenance: None, common: false };
    if !needed {
        return Ok(none);
    }
    if input["removeOnlyHead"] == false
        && let Some(common) = optional(input, "common")?
    {
        return Ok(Selection {
            hash: Some(common.into()),
            provenance: Some(json!({"common":true})),
            common: true,
        });
    }
    let Some(head) = optional(input, "laneHead")?.or(optional(input, "head")?) else {
        return Ok(none);
    };
    verify_versions(input)?;
    walk(array(input, "versions")?, head)
}
fn walk(versions: &[Value], head: &str) -> io::Result<Selection> {
    let mut current = head;
    let mut seen = HashSet::new();
    while let Some(index) = versions
        .iter()
        .position(|version| version["hash"] == current)
    {
        if !seen.insert(index) {
            return Err(invalid("reset cycle"));
        }
        let parents = array(&versions[index], "parents")?;
        if parents.is_empty() {
            break;
        }
        if parents.len() != 1 {
            return Err(invalid("reset multiple parents"));
        }
        let parent = text(&parents[0])?;
        if !versions
            .iter()
            .any(|version| version["hash"] == parent)
        {
            return Ok(Selection {
                hash: Some(parent.into()),
                provenance: Some(json!({"parent":{"versionIndex":index,"parentIndex":0}})),
                common: versions[index]["commonParentIndices"]
                    .as_array()
                    .is_some_and(|indices| indices.contains(&json!(0))),
            });
        }
        current = parent;
    }
    Ok(Selection { hash: None, provenance: None, common: false })
}
fn verify_versions(input: &Value) -> io::Result<()> {
    let directory = Path::new(text(&input["objectsDirectory"])?);
    let mut reader = crate::read_version::Reader::new(directory)?;
    for version in array(input, "versions")? {
        let value = reader.read(text(&version["hash"])?)?;
        let expected = array(version, "parents")?;
        let actual = value["parents"]
            .as_array()
            .map_or(&[][..], Vec::as_slice);
        if actual != expected {
            return Err(invalid("reset cached Version differs from repository"));
        }
        if !deleted(input, version["hash"].as_str())
            && expected.iter().any(|parent| deleted(input, parent.as_str()))
        {
            return Err(invalid("reset surviving version has deleted parent"));
        }
    }
    Ok(())
}
fn tags_remaining(input: &Value) -> io::Result<usize> {
    let mut remaining: Vec<_> = array(input, "tags")?
        .iter()
        .map(|entry| text(&entry["label"]))
        .collect::<io::Result<_>>()?;
    for version in array(input, "versions")? {
        let label = text(&version["label"])?;
        let expected = text(&version["hash"])?;
        let resolved = resolve(input, label, &remaining)?;
        if resolved != expected {
            return Err(invalid("reset reference resolution changed"));
        }
        remaining.retain(|tag| *tag != label);
    }
    Ok(remaining.len())
}
fn resolve<'a>(input: &'a Value, label: &'a str, remaining: &[&str]) -> io::Result<&'a str> {
    if label.len() == 40 && label.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return Ok(label);
    }
    if !tag(label) {
        return Err(invalid("unsupported reset tag"));
    }
    let orphaned = array(input, "orphaned")?
        .iter()
        .find(|entry| entry["label"] == label);
    let normal = array(input, "tags")?
        .iter()
        .find(|entry| entry["label"] == label && remaining.contains(&label));
    text(&orphaned.or(normal).ok_or_else(|| invalid("reset missing tag"))?["hash"])
}
fn tag(label: &str) -> bool {
    label.split('.').count() == 3
        && label
            .split('.')
            .all(|part| {
                !part.is_empty()
                    && (part == "0" || !part.starts_with('0'))
                    && part
                        .parse::<u64>()
                        .is_ok_and(|value| value <= 9_007_199_254_740_991)
            })
}
fn validate(input: &Value) -> io::Result<()> {
    if input
        .as_object()
        .is_none_or(|object| {
            object
                .keys()
                .any(|key| !FIELDS.contains(&key.as_str()))
        })
    {
        return Err(invalid("reset request fields"));
    }
    super::path(Path::new(text(&input["objectsDirectory"])?))?;
    for field in
        ["head", "laneHead", "common", "laneHeadRemote", "laneHeadLocal", "detachedCurrent"]
    {
        optional(input, field)?;
    }
    for field in ["removeOnlyHead", "laneHidden", "laneNew", "hasScope"] {
        if !input[field].is_boolean() {
            return Err(invalid("reset policy boolean"));
        }
    }
    for field in ["deletedRefs", "detachedHeads"] {
        for value in array(input, field)? {
            hash(value)?;
        }
    }
    for field in ["versions", "tags", "orphaned"] {
        records(input, field)?;
    }
    Ok(())
}
fn records(input: &Value, field: &str) -> io::Result<()> {
    let mut labels = HashSet::new();
    for entry in array(input, field)? {
        let label = text(&entry["label"])?;
        if label.is_empty() || label.len() > 4096 || !labels.insert(label) {
            return Err(invalid("reset duplicate label"));
        }
        hash(&entry["hash"])?;
        aliases(input, entry)?;
        if let Some(parents) = entry.get("parents") {
            for parent in parents
                .as_array()
                .filter(|parents| parents.len() <= 4096)
                .ok_or_else(|| invalid("reset parent list"))?
            {
                hash(parent)?;
            }
        }
    }
    Ok(())
}
fn aliases(input: &Value, entry: &Value) -> io::Result<()> {
    let Some(indices) = entry.get("commonParentIndices") else {
        return Ok(());
    };
    let parents = array(entry, "parents")?;
    let mut seen = HashSet::new();
    for index in indices
        .as_array()
        .filter(|indices| indices.len() <= 4096)
        .ok_or_else(|| invalid("reset parent aliases"))?
    {
        let index = index
            .as_u64()
            .and_then(|index| usize::try_from(index).ok())
            .filter(|index| *index < parents.len())
            .ok_or_else(|| invalid("reset parent alias index"))?;
        if !seen.insert(index) || parents[index].as_str() != optional(input, "common")? {
            return Err(invalid("reset common alias identity"));
        }
    }
    Ok(())
}

fn deleted(input: &Value, hash: Option<&str>) -> bool {
    hash.map(str::trim)
        .is_some_and(|hash| {
            input["deletedRefs"]
                .as_array()
                .is_some_and(|refs| {
                    refs.iter()
                        .any(|reference| reference.as_str().map(str::trim) == Some(hash))
                })
        })
}
fn optional<'a>(input: &'a Value, field: &str) -> io::Result<Option<&'a str>> {
    input
        .get(field)
        .map(|value| {
            hash(value)?;
            text(value)
        })
        .transpose()
}
fn hash(value: &Value) -> io::Result<()> {
    crate::merge_history::hash(text(value)?)?;
    Ok(())
}
fn text(value: &Value) -> io::Result<&str> {
    value
        .as_str()
        .map(str::trim)
        .ok_or_else(|| invalid("reset string"))
}
fn array<'a>(input: &'a Value, field: &str) -> io::Result<&'a [Value]> {
    input[field]
        .as_array()
        .filter(|entries| entries.len() <= 4096)
        .map(Vec::as_slice)
        .ok_or_else(|| invalid("reset array budget"))
}
