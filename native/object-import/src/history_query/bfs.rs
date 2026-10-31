use super::invalid;
use serde::Deserialize;
use serde_json::{Value, json};
use std::{
    collections::{HashMap, HashSet, VecDeque},
    io,
    path::PathBuf,
};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Fields {
    objects_directory: PathBuf,
    start: Option<String>,
    main_head: Option<String>,
    #[serde(default)]
    stop_at: Vec<String>,

    throws: bool,
    #[serde(default)]
    overlays: Vec<Value>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Labels {
    #[serde(default)]
    tags: Vec<Tag>,
    #[serde(default)]
    orphaned: Vec<Tag>,
    last_found_tag: Option<String>,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Tag {
    label: String,
    hash: String,
}
struct Request {
    fields: Fields,
    labels: Labels,
    overlays: HashMap<String, usize>,
    stops: HashSet<String>,
    index: crate::tag_index::TagIndex,
}
struct Walk {
    rows: Vec<Value>,
    queue: VecDeque<(String, String)>,
    seen: HashSet<String>,
    found_main: bool,
    cached_tag: Option<String>,
    checkpoint: Option<Value>,
    bytes: usize,
    stopped: Option<Value>,
}
pub(super) fn begin(input: Value) -> io::Result<Value> {
    let request = parse(input)?;
    validate(&request)?;
    let mut reader = crate::read_version::Reader::query(&request.fields.objects_directory)?;
    let mut walk = Walk {
        rows: Vec::new(),
        queue: VecDeque::new(),
        seen: HashSet::new(),
        found_main: request.fields.start == request.fields.main_head,
        cached_tag: request.labels.last_found_tag.clone(),
        checkpoint: None,
        bytes: 0,
        stopped: None,
    };
    if let Some(start) = &request.fields.start {
        load(&request, &mut reader, &mut walk, start, None)?;
    }
    drain(&request, &mut reader, &mut walk)?;
    let overlays = walk.rows
        .iter()
        .filter(|row| row.get("overlayIndex").is_some())
        .count();
    let mut output = json!({"rows":walk.rows,"complete":walk.checkpoint.is_none(),"reads":super::reads(reader.stats(),(0,0),overlays)});
    if let Some(stopped) = walk.stopped {
        output["stoppedHead"] = stopped;
    }
    if let Some(checkpoint) = walk.checkpoint {
        output["checkpoint"] = checkpoint;
    }
    if let Some(cached) = walk.cached_tag {
        output["lastFoundTag"] = json!(cached);
    }
    Ok(output)
}
fn drain(
    request: &Request,
    reader: &mut crate::read_version::Reader<'_>,
    walk: &mut Walk,
) -> io::Result<()> {
    while let Some((parent, from)) = walk.queue.pop_front() {
        if walk.checkpoint.is_some() {
            break;
        }
        if request.stops.contains(&parent) || !walk.seen.insert(parent.clone()) {
            continue;
        }
        if walk.seen.len() > 4096 {
            return Err(invalid("history query record limit"));
        }
        load(request, reader, walk, &parent, Some(&from))?;
    }
    if !walk.queue.is_empty() && walk.checkpoint.is_none() {
        return Err(invalid("history query record limit"));
    }
    Ok(())
}
fn validate(request: &Request) -> io::Result<()> {
    if request.fields.stop_at.len() > 4096
        || request.labels.tags.len() > 4096
        || request.labels.orphaned.len() > 4096
        || request.fields.overlays.len() > 4096
    {
        return Err(invalid("history query metadata limit"));
    }
    for hash in request.fields.start
        .iter()
        .chain(&request.fields.main_head)
        .chain(&request.fields.stop_at)
    {
        crate::merge_history::hash(hash)?;
    }
    for tag in request.labels.tags.iter().chain(&request.labels.orphaned) {
        crate::merge_history::hash(tag.hash.trim())?;
        let label = tag.label.trim();
        if label.is_empty() || label.len() > 32768 || tag.label.contains('\0') {
            return Err(invalid("history query tag"));
        }
    }
    for overlay in &request.fields.overlays {
        validate_overlay(overlay)?;
    }
    Ok(())
}
fn validate_overlay(overlay: &Value) -> io::Result<()> {
    let hash = overlay
        .get("hash")
        .and_then(Value::as_str)
        .ok_or_else(|| invalid("history query overlay hash"))?;
    crate::merge_history::hash(hash)?;
    let parents = overlay
        .get("parents")
        .and_then(Value::as_array)
        .ok_or_else(|| invalid("history query overlay parents"))?;
    if parents.len() > 4096 {
        return Err(invalid("history query overlay parent limit"));
    }
    for parent in parents {
        crate::merge_history::hash(
            parent.as_str().ok_or_else(|| invalid("history query overlay parent"))?,
        )?;
    }
    if !overlay.get("log").is_some_and(Value::is_object) {
        return Err(invalid("history query overlay log"));
    }
    Ok(())
}
fn load(
    request: &Request,
    reader: &mut crate::read_version::Reader<'_>,
    walk: &mut Walk,
    hash: &str,
    from: Option<&str>,
) -> io::Result<()> {
    let tag = tag(request, &mut walk.cached_tag, hash);
    let overlay = request.overlays.get(hash).copied();
    let object = read(request, reader, hash, overlay)?;
    if from.is_none() && object.is_some() && request.stops.contains(hash) {
        stop(walk, hash, overlay, reader);
        return Ok(());
    }
    walk.seen.insert(hash.to_owned());
    if from.is_some() && object.is_some() && request.fields.main_head.as_deref() == Some(hash) {
        walk.found_main = true;
    }
    let mut row = row(object.as_ref(), walk, hash, from, tag.as_deref(), overlay);
    if let Some(object) = object {
        loaded(walk, &mut row, &object, hash, overlay.is_none().then_some(&*reader))?;
    } else {
        missing(request, walk, &mut row, from, tag.is_some());
    }
    append(walk, row)
}
fn append(walk: &mut Walk, row: Value) -> io::Result<()> {
    walk.bytes += serde_json::to_vec(&row).map_err(io::Error::other)?.len();
    if walk.bytes > 4 * 1024 * 1024 - 256 || walk.queue.len() > 65536 {
        return Err(invalid("history query output limit"));
    }
    walk.rows.push(row);
    Ok(())
}
fn read(
    request: &Request,
    reader: &mut crate::read_version::Reader<'_>,
    hash: &str,
    overlay: Option<usize>,
) -> io::Result<Option<Value>> {
    match overlay.map_or_else(
        || reader.read(hash),
        |index| Ok(request.fields.overlays[index].clone()),
    ) {
        Ok(value) => Ok(Some(value)),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(error),
    }
}
fn row(
    object: Option<&Value>,
    walk: &Walk,
    hash: &str,
    from: Option<&str>,
    tag: Option<&str>,
    overlay: Option<usize>,
) -> Value {
    let parents = object
        .and_then(|value| value.get("parents"))
        .filter(|value| !value.is_null())
        .cloned()
        .unwrap_or(json!([]));
    let mut row = json!({"hash":hash,"parents":parents,"onLane":!walk.found_main});
    if from.is_some() {
        row["isPartOfHistory"] = json!(true);
    }
    if let Some(tag) = tag {
        row["tag"] = json!(tag);
    }
    if let Some(index) = overlay {
        row["overlayIndex"] = json!(index);
    }
    row
}
fn loaded(
    walk: &mut Walk,
    row: &mut Value,
    object: &Value,
    hash: &str,
    reader: Option<&crate::read_version::Reader<'_>>,
) -> io::Result<()> {
    row["log"] = object["log"].clone();
    if let Some(files) = object.get("files") {
        row["files"] = files.clone();
    }
    row["hidden"] = object
        .get("hidden")
        .cloned()
        .unwrap_or(json!(false));
    for parent in row["parents"].as_array().ok_or_else(|| invalid("history query parents"))? {
        walk.queue.push_back((
            parent
                .as_str()
                .ok_or_else(|| invalid("history query parent"))?
                .trim()
                .to_owned(),
            hash.to_owned(),
        ));
    }
    if let Some(reader) = reader {
        metadata(row, reader);
    }
    Ok(())
}
fn tag(request: &Request, cached: &mut Option<String>, hash: &str) -> Option<String> {
    let (label, normal) = request.index.get(hash)?;
    if normal {
        *cached = Some(label.to_owned());
    }
    Some(label.to_owned())
}

fn missing(request: &Request, walk: &mut Walk, row: &mut Value, from: Option<&str>, tagged: bool) {
    let mut missing =
        json!({"kind":if from.is_none() {"head"} else if tagged {"tag"} else {"parent"}});
    if let Some(from) = from {
        missing["parentOf"] = json!(from);
    }
    row["missing"] = missing.clone();
    if request.fields.throws {
        walk.checkpoint = Some(missing);
    }
}

fn parse(mut input: Value) -> io::Result<Request> {
    let map = input.as_object_mut().ok_or_else(|| invalid("history query request"))?;
    let mut labels = serde_json::Map::new();
    for key in ["tags", "orphaned", "lastFoundTag"] {
        if let Some(value) = map.remove(key) {
            labels.insert(key.to_owned(), value);
        }
    }
    let labels: Labels = serde_json::from_value(Value::Object(labels)).map_err(io::Error::other)?;
    let fields: Fields = serde_json::from_value(input).map_err(io::Error::other)?;
    let overlays = super::overlay_indices(&fields.overlays);
    let stops = fields.stop_at
        .iter()
        .map(|hash| hash.trim().to_owned())
        .collect();
    let mut index = crate::tag_index::TagIndex::default();
    for tag in &labels.orphaned {
        index.insert(tag.hash.trim(), tag.label.trim(), false);
    }
    for tag in &labels.tags {
        index.insert(tag.hash.trim(), tag.label.trim(), true);
    }
    Ok(Request { fields, labels, overlays, stops, index })
}

fn metadata(row: &mut Value, reader: &crate::read_version::Reader<'_>) {
    if let Some((body, size, compressed)) = reader.metadata() {
        row["versionJSON"] = json!(body);
        row["inflatedSize"] = json!(size);
        row["compressedSize"] = json!(compressed);
    }
}

fn stop(
    walk: &mut Walk,
    hash: &str,
    overlay: Option<usize>,
    reader: &crate::read_version::Reader<'_>,
) {
    let mut stopped = json!({"hash":hash});
    if let Some(index) = overlay {
        stopped["overlayIndex"] = json!(index);
    } else {
        metadata(&mut stopped, reader);
    }
    walk.stopped = Some(stopped);
}
