//! Bounded import merge plans ([`Operation`], [`HistoryPlan`], [`ComponentPlan`], [`IndexPlan`], [`plan`]) over caller-owned canonical `Component`, `Version`, and `VersionHistory` values.
use serde::Deserialize;
use serde_json::{Value, json};
use std::{
    collections::{HashMap, HashSet},
    io,
};

/// Ordered list of `[tag, hash]` string pairs in `Component` import merge plans.
type Tags = Vec<[String; 2]>;

/// Deserialized import merge operation variant (`Version`, `VersionHistory`, or `Component`).
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
enum Operation {
    Version { existing: String, incoming: String },
    VersionHistory(HistoryPlan),
    Component(ComponentPlan),
}
/// Deserialized `VersionHistory` merge input (`existing`, `incoming`, and `stored` hashes).
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
struct HistoryPlan {
    existing: Vec<String>,
    incoming: Vec<String>,
    stored: Vec<String>,
}
/// Deserialized `Component` import merge input (tags, orphaned tags, heads, and deleted versions).
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
struct ComponentPlan {
    existing: Tags,
    incoming: Tags,
    orphaned: Tags,
    local: Vec<String>,
    origin: bool,
    heads: [Vec<String>; 2],
    deleted: [Vec<String>; 2],
}
/// Deserialized `index.json` merge input (`components`, `lanes`, and `objects` entries).
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
struct IndexPlan {
    components: Vec<IndexEntry>,
    lanes: Vec<IndexEntry>,
    objects: Vec<IndexObject>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
struct IndexEntry {
    hash: String,
    id: Value,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
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
    let hashes: HashSet<_> = plan.incoming
        .iter()
        .map(String::as_str)
        .map(str::trim)
        .collect();
    let original: HashSet<_> = plan.stored
        .iter()
        .map(String::as_str)
        .map(str::trim)
        .collect();
    json!(
        plan.existing
            .iter()
            .enumerate()
            .filter_map(|(index, hash)| {
                let hash = hash.trim();
                (original.contains(hash) && !hashes.contains(hash)).then_some(index)
            })
            .collect::<Vec<_>>()
    )
}

fn unique(existing: &[String], incoming: &[String]) -> Vec<[usize; 2]> {
    let mut seen = HashSet::with_capacity(existing.len() + incoming.len());
    [existing, incoming]
        .into_iter()
        .enumerate()
        .flat_map(|(side, values)| {
            values
                .iter()
                .enumerate()
                .map(move |(index, value)| (side, index, value.trim()))
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
        let local: HashSet<_> = self.local
            .iter()
            .map(|tag| tag.trim())
            .collect();
        self.incoming
            .iter()
            .filter_map(|[tag, hash]| {
                let tag_str = tag.trim();
                let hash_str = hash.trim();
                (local.contains(tag_str)
                    && self.existing
                        .iter()
                        .any(|[old_tag, old_hash]| {
                            old_tag.trim() == tag_str && old_hash.trim() != hash_str
                        }))
                .then_some(tag_str)
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
            .map(|(index, [tag, hash])| (tag.trim(), (index, hash.trim())))
            .collect();
        let local: HashSet<_> = self.local
            .iter()
            .map(|tag| tag.trim())
            .collect();
        for (index, [tag, hash]) in self.existing.iter().enumerate() {
            let tag_str = tag.trim();
            match incoming.get(tag_str) {
                Some((new_index, new_hash)) if hash.trim() != *new_hash => {
                    actions.push(json!(["tag", 1, new_index]));
                }
                None if !local.contains(tag_str) => {
                    present.remove(tag_str);
                    actions.push(json!(["remove", 0, index]));
                }
                _ => {}
            }
        }
    }
    fn actions(&self) -> Vec<Value> {
        let mut present: HashSet<_> = self.existing
            .iter()
            .map(|[tag, _]| tag.trim())
            .collect();
        let mut actions = Vec::new();
        self.replacements(&mut present, &mut actions);
        for (index, [tag, _]) in self.incoming.iter().enumerate() {
            let tag_str = tag.trim();
            let missing =
                if self.origin { present.insert(tag_str) } else { !present.contains(tag_str) };
            if missing {
                actions.push(json!([if self.origin { "tag" } else { "orphan" }, 1, index]));
            }
        }
        actions.extend(
            self.orphaned
                .iter()
                .enumerate()
                .filter(|(_, [tag, _])| !present.contains(tag.trim()))
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
                .entry(entry.hash.trim())
                .or_insert((category, index, &entry.id));
        }
    }
    fn apply(&mut self, offset: usize, object: &'a IndexObject) -> Option<()> {
        let obj_category = object.category.trim();
        let obj_hash = object.hash.trim();
        if obj_hash.is_empty() || !matches!(obj_category, "component" | "lane") {
            return None;
        }
        match self.found.entry(obj_hash) {
            std::collections::hash_map::Entry::Vacant(vacant) => {
                let index = self.counts[usize::from(obj_category == "lane")];
                self.counts[usize::from(obj_category == "lane")] += 1;
                vacant.insert((obj_category, index, &object.id));
                self.actions.push(json!(["add", offset, index]));
            }
            std::collections::hash_map::Entry::Occupied(mut occupied) => {
                if obj_category != "lane" {
                    return Some(());
                }
                let (category, index, id) = *occupied.get();
                if category != "lane" {
                    return None;
                }
                if *id != object.id {
                    self.actions.push(json!(["rename", offset, index]));
                    occupied.insert(("lane", index, &object.id));
                }
            }
        }
        Some(())
    }
}
pub(crate) fn project_index(value: Value) -> io::Result<Value> {
    let plan: IndexPlan =
        serde_json::from_value(value).map_err(|_| invalid("invalid index projection"))?;
    if plan.components.len() > 65_536 || plan.lanes.len() > 4096 || plan.objects.len() > 65_536 {
        return Err(invalid("unsupported index projection"));
    }
    let result = index(&plan.components, &plan.lanes, &plan.objects);
    if result.is_null() {
        return Err(invalid("unsupported index projection"));
    }
    Ok(result)
}

fn index(components: &[IndexEntry], lanes: &[IndexEntry], objects: &[IndexObject]) -> Value {
    let mut state = IndexState {
        found: HashMap::with_capacity(components.len() + lanes.len() + objects.len()),
        counts: [components.len(), lanes.len()],
        actions: Vec::with_capacity(objects.len()),
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
