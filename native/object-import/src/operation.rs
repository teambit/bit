//! Bounded import plans use caller-owned canonical values; no object/cache state survives a frame.
use serde::Deserialize;
use serde_json::{Value, json};
use std::{
    collections::{HashMap, HashSet},
    io,
};

type Tags = Vec<[String; 2]>;

#[derive(Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
enum Operation {
    Version { existing: String, incoming: String },
    VersionHistory(HistoryPlan),
    Component(ComponentPlan),
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

/// Reuse import decisions within a retained command without a transport roundtrip.
pub fn plan(value: Value) -> io::Result<Value> {
    let operation: Operation = serde_json::from_value(value).map_err(io::Error::other)?;
    Ok(execute(operation))
}

fn execute(operation: Operation) -> Value {
    match operation {
        // JavaScript compares these string dates lexicographically, in UTF-16 code units.
        Operation::Version { existing, incoming } => json!(
            existing
                .encode_utf16()
                .cmp(incoming.encode_utf16())
                .is_gt()
        ),
        Operation::VersionHistory(plan) => history(&plan),
        Operation::Component(plan) => plan.result(),
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

fn invalid(message: &str) -> io::Error {
    io::Error::new(io::ErrorKind::InvalidData, message)
}
