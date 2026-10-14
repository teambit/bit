//! Bounded import plans use caller-owned canonical values; no object/cache state survives a frame.
use crate::{protocol, store::Store};

pub(crate) fn spool(
    reader: &mut impl Read,
    writer: &mut impl Write,
    store: Option<&Store>,
) -> io::Result<()> {
    use std::{
        fs::OpenOptions,
        io::{Seek, SeekFrom},
    };
    let store = store.ok_or_else(|| invalid("missing spool directory"))?;
    let id = protocol::word(reader)?;
    let offset = protocol::word(reader)?;
    let length = protocol::word(reader)? as usize;
    let maximum = protocol::word(reader)?;
    if length == 0
        || length > 1024 * 1024
        || maximum > 2 * 1024 * 1024 * 1024
        || u64::from(offset) + length as u64 > u64::from(maximum)
    {
        return Err(invalid("spool byte bounds"));
    }
    let mut bytes = vec![0; length];
    reader.read_exact(&mut bytes)?;
    let path = store.directory().join("input.tar");
    if !path.symlink_metadata()?.is_file() {
        return Err(invalid("invalid spool file"));
    }
    let mut file = OpenOptions::new().write(true).open(path)?;
    if file.metadata()?.len() != u64::from(offset) {
        return Err(invalid("spool offset changed"));
    }
    file.seek(SeekFrom::Start(u64::from(offset)))?;
    file.write_all(&bytes)?;
    protocol::respond(
        writer,
        &Response { version: 1, id, results: vec![json!(u64::from(offset) + length as u64)] },
    )
}
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::{
    collections::{HashMap, HashSet},
    io::{self, Read, Write},
};

const MAX_BYTES: usize = 8 * 1024 * 1024;
type Tags = Vec<[String; 2]>;

#[derive(Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
enum Operation {
    Version { existing: String, incoming: String },
    VersionHistory(HistoryPlan),
    LaneHistory { existing: Vec<String>, incoming: Vec<String> },
    Component(ComponentPlan),
    Index(IndexPlan),
    IndexWrite { contents: String },
    Persist(PersistRequest),
    Missing { hash: String },
}
#[derive(Deserialize)]
struct HistoryPlan {
    existing: Vec<String>,
    incoming: Vec<String>,
    stored: Vec<String>,
}
#[derive(Deserialize)]
struct ComponentPlan {
    existing: Tags,
    incoming: Tags,
    orphaned: Tags,
    local: Vec<String>,
    origin: bool,
    heads: [Vec<String>; 2],
    deleted: [Vec<String>; 2],
}
#[derive(Deserialize)]
struct IndexPlan {
    components: Vec<IndexEntry>,
    lanes: Vec<IndexEntry>,
    objects: Vec<IndexObject>,
}
#[derive(Deserialize)]
struct PersistRequest {
    hash: String,
    serialized: String,
}

#[derive(Deserialize)]
struct IndexEntry {
    hash: String,
    id: Value,
}

#[derive(Deserialize)]
struct IndexObject {
    hash: String,
    id: Value,
    category: String,
}

#[derive(Serialize)]
struct Response {
    version: u8,
    id: u32,
    results: Vec<Value>,
}

pub(crate) fn serve(
    reader: &mut impl Read,
    writer: &mut impl Write,
    store: Option<&Store>,
) -> io::Result<()> {
    let id = protocol::word(reader)?;
    let length = protocol::word(reader)? as usize;
    if !(1..=MAX_BYTES).contains(&length) {
        return Err(invalid("operation bytes out of bounds"));
    }
    let mut bytes = vec![0; length];
    reader.read_exact(&mut bytes)?;
    let operations: Vec<Operation> =
        serde_json::from_slice(&bytes).map_err(|_| invalid("invalid operation"))?;
    if !(1..=64).contains(&operations.len()) {
        return Err(invalid("operation count out of bounds"));
    }
    let results = operations
        .into_iter()
        .map(|operation| execute(operation, store))
        .collect();
    protocol::respond(writer, &Response { version: 1, id, results })
}

/// Reuse import decisions within a retained command without a transport roundtrip.
pub fn plan(value: Value) -> io::Result<Value> {
    let operation: Operation = serde_json::from_value(value).map_err(io::Error::other)?;
    if !matches!(
        operation,
        Operation::Version { .. } | Operation::VersionHistory(_) | Operation::Component(_),
    ) {
        return Err(invalid("command import requires a pure decision"));
    }
    Ok(execute(operation, None))
}

fn execute(operation: Operation, store: Option<&Store>) -> Value {
    match operation {
        // JavaScript compares these string dates lexicographically, in UTF-16 code units.
        Operation::Version { existing, incoming } => json!(
            existing
                .encode_utf16()
                .cmp(incoming.encode_utf16())
                .is_gt()
        ),
        Operation::VersionHistory(plan) => history(&plan),
        Operation::LaneHistory { existing, incoming } => json!(overlay(&existing, &incoming)),
        Operation::Component(plan) => plan.result(),
        Operation::Index(plan) => index(&plan.components, &plan.lanes, &plan.objects),
        Operation::IndexWrite { contents } => {
            let valid =
                contents.len() <= MAX_BYTES && serde_json::from_str::<Value>(&contents).is_ok();
            json!(
                valid && store.is_some_and(|store| store.write_index(contents.as_bytes()).is_ok())
            )
        }
        Operation::Persist(request) => persist(&request, store),
        Operation::Missing { hash } => missing(&hash, store),
    }
}
fn missing(hash: &str, store: Option<&Store>) -> Value {
    if hash.len() != 40 {
        return Value::Null;
    }
    let Some(store) = store else {
        return Value::Null;
    };
    let Ok(bytes) = decode(hash) else {
        return Value::Null;
    };
    let Ok(identity) = <[u8; 20]>::try_from(bytes) else {
        return Value::Null;
    };
    match std::fs::metadata(store.object_path(&identity)) {
        Ok(_) => json!(true),
        Err(error) if error.kind() == io::ErrorKind::NotFound => json!(false),
        Err(_) => Value::Null,
    }
}

fn history(plan: &HistoryPlan) -> Value {
    let hashes: HashSet<_> = plan.incoming.iter().collect();
    let original: HashSet<_> = plan.stored.iter().collect();
    json!(
        plan.existing
            .iter()
            .enumerate()
            .filter_map(|(index, hash)| (original.contains(hash) && !hashes.contains(hash))
                .then_some(index))
            .collect::<Vec<_>>()
    )
}
fn persist(request: &PersistRequest, store: Option<&Store>) -> Value {
    let result = decode(&request.serialized)
        .and_then(|bytes| {
            let store = store.ok_or_else(|| invalid("missing operation store"))?;
            let result =
                crate::mutable_store::persist_serialized(store, &request.hash, &bytes, true);
            // Ordered replacements must not use Source batch deduplication.
            store.finish_batch()?;
            result
        });
    result.map_or(Value::Null, |size| json!(size))
}

/// Spread preserves the first insertion position, replacing its value with the incoming one.
fn overlay(existing: &[String], incoming: &[String]) -> Vec<[usize; 2]> {
    let positions: HashMap<_, _> = incoming
        .iter()
        .enumerate()
        .map(|(index, key)| (key, index))
        .collect();
    let old: HashSet<_> = existing.iter().collect();
    existing
        .iter()
        .enumerate()
        .map(|(index, key)| {
            positions
                .get(key)
                .map_or([0, index], |index| [1, *index])
        })
        .chain(
            incoming
                .iter()
                .enumerate()
                .filter_map(|(index, key)| (!old.contains(key)).then_some([1, index])),
        )
        .collect()
}

fn unique(existing: &[String], incoming: &[String]) -> Vec<[usize; 2]> {
    let mut seen = HashSet::new();
    [existing, incoming]
        .into_iter()
        .enumerate()
        .flat_map(|(side, values)| {
            values
                .iter()
                .enumerate()
                .map(move |(index, value)| (side, index, value))
        })
        .filter_map(|(side, index, value)| {
            seen.insert(value)
                .then_some([side, index])
        })
        .collect()
}

impl ComponentPlan {
    fn conflicts(&self) -> Vec<&str> {
        if !self.origin {
            return Vec::new();
        }
        let local: HashSet<_> = self.local.iter().collect();
        self.incoming
            .iter()
            .filter_map(|[tag, hash]| {
                (local.contains(tag)
                    && self.existing
                        .iter()
                        .any(|[old_tag, old_hash]| old_tag == tag && old_hash != hash))
                .then_some(tag.as_str())
            })
            .collect()
    }
    fn replacements(&self, present: &mut HashSet<&str>, actions: &mut Vec<Value>) {
        if !self.origin {
            return;
        }
        let incoming: HashMap<_, _> = self.incoming
            .iter()
            .enumerate()
            .map(|(index, [tag, hash])| (tag.as_str(), (index, hash)))
            .collect();
        let local: HashSet<_> = self.local
            .iter()
            .map(String::as_str)
            .collect();
        for (index, [tag, hash]) in self.existing.iter().enumerate() {
            match incoming.get(tag.as_str()) {
                Some((new_index, new_hash)) if hash != *new_hash => {
                    actions.push(json!(["tag", 1, new_index]));
                }
                None if !local.contains(tag.as_str()) => {
                    present.remove(tag.as_str());
                    actions.push(json!(["remove", 0, index]));
                }
                _ => {}
            }
        }
    }
    fn actions(&self) -> Vec<Value> {
        let mut present: HashSet<_> = self.existing
            .iter()
            .map(|[tag, _]| tag.as_str())
            .collect();
        let mut actions = Vec::new();
        self.replacements(&mut present, &mut actions);
        for (index, [tag, _]) in self.incoming.iter().enumerate() {
            let missing =
                if self.origin { present.insert(tag) } else { !present.contains(tag.as_str()) };
            if missing {
                actions.push(json!([if self.origin { "tag" } else { "orphan" }, 1, index]));
            }
        }
        actions.extend(
            self.orphaned
                .iter()
                .enumerate()
                .filter(|(_, [tag, _])| !present.contains(tag.as_str()))
                .map(|(index, _)| json!(["orphan", 2, index])),
        );
        actions
    }
    fn result(&self) -> Value {
        let conflicts = self.conflicts();
        if !conflicts.is_empty() {
            return json!({ "conflicts": conflicts });
        }
        json!({ "conflicts": [], "actions": self.actions(), "heads": unique(&self.heads[0], &self.heads[1]), "deleted": unique(&self.deleted[0], &self.deleted[1]) })
    }
}

struct IndexState<'a> {
    found: HashMap<&'a str, (&'a str, usize, &'a Value)>,
    counts: [usize; 2],
    actions: Vec<Value>,
}
impl<'a> IndexState<'a> {
    fn add_existing(&mut self, category: &'a str, entries: &'a [IndexEntry]) {
        for (index, entry) in entries.iter().enumerate() {
            self.found
                .entry(&entry.hash)
                .or_insert((category, index, &entry.id));
        }
    }
    fn apply(&mut self, offset: usize, object: &'a IndexObject) -> Option<()> {
        if !matches!(object.category.as_str(), "component" | "lane") {
            return None;
        }
        let Some((category, index, id)) = self.found.get(object.hash.as_str()).copied() else {
            let side = usize::from(object.category == "lane");
            let index = self.counts[side];
            self.counts[side] += 1;
            self.found.insert(&object.hash, (&object.category, index, &object.id));
            self.actions.push(json!(["add", offset, index]));
            return Some(());
        };
        if object.category != "lane" {
            return Some(());
        }
        if category != "lane" {
            return None;
        }
        if *id != object.id {
            self.actions.push(json!(["rename", offset, index]));
            self.found.insert(&object.hash, ("lane", index, &object.id));
        }
        Some(())
    }
}
pub(crate) fn project_index(value: Value) -> io::Result<Value> {
    let plan: IndexPlan =
        serde_json::from_value(value).map_err(|_| invalid("invalid index projection"))?;
    let result = index(&plan.components, &plan.lanes, &plan.objects);
    if result.is_null() {
        return Err(invalid("unsupported index projection"));
    }
    Ok(result)
}

fn index(components: &[IndexEntry], lanes: &[IndexEntry], objects: &[IndexObject]) -> Value {
    let mut state = IndexState {
        found: HashMap::new(),
        counts: [components.len(), lanes.len()],
        actions: Vec::new(),
    };
    state.add_existing("component", components);
    state.add_existing("lane", lanes);
    for (offset, object) in objects.iter().enumerate() {
        if state.apply(offset, object).is_none() {
            return Value::Null;
        }
    }
    json!(state.actions)
}

fn decode(text: &str) -> io::Result<Vec<u8>> {
    if text.is_empty() || text.len() > 1024 * 1024 || !text.len().is_multiple_of(2) {
        return Err(invalid("serialized operation bounds"));
    }
    text.as_bytes()
        .chunks_exact(2)
        .map(|pair| {
            let digit = |value: u8| match value {
                b'0'..=b'9' => Ok(value - b'0'),
                b'a'..=b'f' => Ok(value - b'a' + 10),
                _ => Err(invalid("invalid serialized hex")),
            };
            Ok(digit(pair[0])? * 16 + digit(pair[1])?)
        })
        .collect()
}

fn invalid(message: &str) -> io::Error {
    io::Error::new(io::ErrorKind::InvalidData, message)
}
