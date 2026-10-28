use super::{invalid, overlay_indices};
use indexmap::IndexMap;
use serde::Deserialize;
use serde_json::{Value, json};
use std::{
    collections::{HashMap, HashSet},
    io,
    path::PathBuf,
};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Request {
    existing: Vec<String>,
    #[serde(default)]
    overlays: Vec<Value>,
}
fn read(
    reader: &mut crate::read_version::Reader<'_>,
    overlays: &[Value],
    indices: &HashMap<String, usize>,
    hash: &str,
) -> io::Result<Option<Value>> {
    if let Some(&index) = indices.get(hash) {
        let mut value = overlays[index].clone();
        value["overlayIndex"] = json!(index);
        return Ok(Some(value));
    }
    match reader.read(hash) {
        Ok(mut value) => {
            if let Some((body, size, compressed)) = reader.metadata() {
                value["versionJSON"] = json!(body);
                value["inflatedSize"] = json!(size);
                value["compressedSize"] = json!(compressed);
            }
            Ok(Some(value))
        }
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(error),
    }
}
fn record(hash: &str, value: &Value) -> io::Result<Value> {
    crate::merge_history::hash(hash)?;
    let parents = value
        .get("parents")
        .filter(|value| !value.is_null())
        .cloned()
        .unwrap_or(json!([]));
    let parents = parents.as_array().ok_or_else(|| invalid("history population parents"))?;
    if parents.len() > 4096 {
        return Err(invalid("history population parents limit"));
    }
    for parent in parents {
        crate::merge_history::hash(
            parent.as_str().ok_or_else(|| invalid("history population ref"))?,
        )?;
    }
    let mut row = json!({"hash":hash,"parents":parents});
    history_fields(&mut row, value);
    for key in ["versionJSON", "inflatedSize", "compressedSize"] {
        if let Some(value) = value.get(key) {
            row[key] = value.clone();
        }
    }
    validate_history_refs(&row)?;
    if let Some(index) = value.get("overlayIndex") {
        row["overlayIndex"] = index.clone();
    }
    Ok(row)
}
fn history_fields(row: &mut Value, value: &Value) {
    if let Some(value) = value
        .get("unrelated")
        .and_then(|value| {
            value
                .as_str()
                .map(|_| value)
                .or_else(|| value.get("head"))
        })
    {
        row["unrelated"] = value.clone();
    }
    if let Some(value) = value
        .get("squashed")
        .and_then(|value| {
            value
                .as_array()
                .map(|_| value)
                .or_else(|| value.get("previousParents"))
        })
    {
        row["squashed"] = value.clone();
    }
}
fn validate_history_refs(row: &Value) -> io::Result<()> {
    if let Some(reference) = row.get("unrelated") {
        crate::merge_history::hash(
            reference.as_str().ok_or_else(|| invalid("history population unrelated ref"))?,
        )?;
    }
    if let Some(references) = row.get("squashed") {
        let references =
            references.as_array().ok_or_else(|| invalid("history population squashed refs"))?;
        if references.len() > 4096 {
            return Err(invalid("history population squashed limit"));
        }
        for reference in references {
            crate::merge_history::hash(
                reference.as_str().ok_or_else(|| invalid("history population squashed ref"))?,
            )?;
        }
    }
    Ok(())
}
fn populate(request: &Request, plan: &Value) -> io::Result<Value> {
    if plan.get("skip") == Some(&Value::Bool(true)) {
        return Ok(json!({"added":[],"missing":[],"complete":true,"skip":true}));
    }
    if let Some(missing) = plan.get("missing") {
        return Ok(json!({"added":[],"missing":[missing],"complete":false,"lastErrorIndex":0}));
    }
    if request.existing.len() > 4096 || request.overlays.len() > 4096 {
        return Err(invalid("history population limit"));
    }
    for reference in &request.existing {
        crate::merge_history::hash(reference)?;
    }
    let path = PathBuf::from(
        plan.get("objectsDirectory")
            .and_then(Value::as_str)
            .ok_or_else(|| invalid("history population directory"))?,
    );
    let mut reader = crate::read_version::Reader::query(&path)?;
    let head = plan.get("head").ok_or_else(|| invalid("history population head"))?;
    let hash = head
        .get("hash")
        .and_then(Value::as_str)
        .ok_or_else(|| invalid("history population head ref"))?;
    let head = record(hash, head)?;
    let mut added = IndexMap::new();
    if plan.get("headExists") != Some(&Value::Bool(true)) {
        added.insert(hash.to_owned(), head.clone());
    }
    let mut missing = Vec::new();
    traverse(request, plan, &head, &mut reader, &mut added, &mut missing)?;
    let overlays = 1 + added
        .values()
        .filter(|row| row.get("overlayIndex").is_some())
        .count();
    let added = added.into_values().collect::<Vec<_>>();
    let mut output = json!({"added":added,"missing":missing,"complete":missing.is_empty(),"reads":super::reads(reader.stats(),(0,0),overlays)});
    if !missing.is_empty() {
        output["lastErrorIndex"] = json!(missing.len() - 1);
    }
    Ok(output)
}
struct Trace<'a> {
    active: HashSet<String>,
    stack: Vec<(String, Value, bool)>,
    count: usize,
    added: &'a mut IndexMap<String, Value>,
    existing: HashSet<String>,
    overlays: HashMap<String, usize>,
    missing: &'a mut Vec<Value>,
}
fn traverse(
    request: &Request,
    plan: &Value,
    head: &Value,
    reader: &mut crate::read_version::Reader<'_>,
    added: &mut IndexMap<String, Value>,
    missing: &mut Vec<Value>,
) -> io::Result<()> {
    let hash = head["hash"]
        .as_str()
        .ok_or_else(|| invalid("history population hash"))?
        .to_owned();
    let mut trace = Trace {
        active: HashSet::new(),
        stack: vec![(hash, head.clone(), false)],
        count: 0,
        added,
        missing,
        existing: request.existing
            .iter()
            .cloned()
            .collect(),
        overlays: overlay_indices(&request.overlays),
    };
    let exit_when_find = plan.get("exitWhenFind") == Some(&Value::Bool(true));
    while let Some((hash, row, exit)) = trace.stack.pop() {
        if exit {
            trace.active.remove(&hash);
            continue;
        }
        let Some(row) = trace.resolve(request, exit_when_find, &hash, &row, reader)? else {
            continue;
        };
        if !trace.active.insert(hash.clone()) {
            return Err(invalid("history population cycle"));
        }
        trace.push(&hash, &row)?;
    }
    Ok(())
}
impl Trace<'_> {
    fn resolve(
        &mut self,
        request: &Request,
        exit: bool,
        hash: &str,
        row: &Value,
        reader: &mut crate::read_version::Reader<'_>,
    ) -> io::Result<Option<Value>> {
        let Some(parent) = row.get("parentOf") else { return Ok(Some(row.clone())) };
        if exit && (self.existing.contains(hash) || self.added.contains_key(hash)) {
            return Ok(None);
        }
        self.count += 1;
        if self.count > 4096 {
            return Err(invalid("history population traversal limit"));
        }
        let Some(value) = read(reader, &request.overlays, &self.overlays, hash)? else {
            self.missing.push(json!({"hash":hash,"parentOf":parent,"kind":"parent"}));
            return Ok(None);
        };
        let row = record(hash, &value)?;
        self.added.insert(hash.to_owned(), row.clone());
        Ok(Some(row))
    }
    fn push(&mut self, hash: &str, row: &Value) -> io::Result<()> {
        let parents =
            row["parents"].as_array().ok_or_else(|| invalid("history population parent rows"))?;
        if self.stack.len() + parents.len() > 65536 {
            return Err(invalid("history population stack limit"));
        }
        self.stack.push((hash.to_owned(), row.clone(), true));
        for parent in parents.iter().rev() {
            self.stack.push((
                parent
                    .as_str()
                    .ok_or_else(|| invalid("history population parent"))?
                    .to_owned(),
                json!({"parentOf":hash}),
                false,
            ));
        }
        Ok(())
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Fields {
    objects_directory: PathBuf,
    head: String,
    head_exists: bool,
    exit_when_find: bool,
    existing: Vec<String>,
    head_data: Value,
    #[serde(default)]
    overlays: Vec<Value>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Labels {
    #[serde(default)]
    tags: Vec<Value>,
    #[serde(default)]
    orphaned: Vec<Value>,
    last_found_tag: Option<String>,
}
pub(crate) fn begin(input: Value) -> io::Result<Value> {
    let (request, labels) = parse(input)?;
    crate::merge_history::hash(&request.head)?;
    if request.head_data.get("hash").and_then(Value::as_str) != Some(&request.head) {
        return Err(invalid("history population head identity"));
    }
    let plan = json!({"objectsDirectory":request.objects_directory,"headExists":request.head_exists,"exitWhenFind":request.exit_when_find,"head":request.head_data,"skip":request.exit_when_find && request.head_exists});
    let mut cached = labels.last_found_tag;
    let mut index = crate::tag_index::TagIndex::default();
    for tag in &labels.orphaned {
        index_value(&mut index, tag, false);
    }
    for tag in &labels.tags {
        index_value(&mut index, tag, true);
    }
    let request = Request { existing: request.existing, overlays: request.overlays };
    let mut result = populate(&request, &plan)?;
    annotate(&mut result, &index, &mut cached);
    Ok(result)
}
fn index_value(index: &mut crate::tag_index::TagIndex, value: &Value, normal: bool) {
    if let (Some(hash), Some(label)) = (value["hash"].as_str(), value["label"].as_str()) {
        index.insert(hash, label, normal);
    }
}
fn annotate(result: &mut Value, index: &crate::tag_index::TagIndex, cached: &mut Option<String>) {
    if let Some(missing) = result.get_mut("missing").and_then(Value::as_array_mut) {
        for row in missing {
            annotate_row(row, index, cached);
        }
    }
    if let Some(cached) = cached {
        result["lastFoundTag"] = json!(cached);
    }
}

fn annotate_row(row: &mut Value, index: &crate::tag_index::TagIndex, cached: &mut Option<String>) {
    let Some(hash) = row["hash"].as_str() else {
        return;
    };
    let Some((label, normal)) = index.get(hash) else {
        return;
    };
    if normal {
        *cached = Some(label.to_owned());
    }
    row["tag"] = json!(label);
    row["kind"] = json!("tag");
}

fn parse(mut input: Value) -> io::Result<(Fields, Labels)> {
    let map = input.as_object_mut().ok_or_else(|| invalid("history population request"))?;
    let mut labels = serde_json::Map::new();
    for key in ["tags", "orphaned", "lastFoundTag"] {
        if let Some(value) = map.remove(key) {
            labels.insert(key.to_owned(), value);
        }
    }
    Ok((
        serde_json::from_value(input).map_err(io::Error::other)?,
        serde_json::from_value(Value::Object(labels)).map_err(io::Error::other)?,
    ))
}
