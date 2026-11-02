//! The Lane model (`scopes/scope/objects/models/lane.ts`): parsing, the
//! mutations the import merge uses, and `toObject()` serialization.
//!
//! Preserves schema version ([`OLD_LANE_SCHEMA`]), readme components, log metadata, and `isDeleted` component flags in [`LaneComponent`].

use crate::import::bitmap::Id;
use serde_json::{Map, Value, json};

/// Lanes without `isDeleted` data (the old lane schema in `TypeScript`).
pub const OLD_LANE_SCHEMA: &str = "0.0.0";

/// Visible lane component entry holding `scope`, `name`, `head` hash, and `is_deleted` flag.
#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub struct LaneComponent {
    pub scope: String,
    pub name: String,
    pub head: String,
    pub is_deleted: bool,
}

impl LaneComponent {
    #[inline]
    fn same_id(&self, scope: &str, name: &str) -> bool {
        self.scope.trim() == scope.trim() && self.name.trim() == name.trim()
    }
}

/// A parsed Lane object with the in-memory `hasChanged` flag.
#[derive(Debug, Clone, PartialEq)]
#[cfg_attr(
    dylint_lib = "perfectionist",
    expect(
        perfectionist::too_many_struct_fields,
        reason = "The fields mirror the TypeScript Lane model."
    )
)]
pub struct LaneObject {
    pub name: String,
    pub scope: String,
    pub components: Vec<LaneComponent>,
    pub log: Value,
    pub readme_component: Option<Value>,
    pub forked_from: Option<Value>,
    pub schema: String,
    /// `updateDependents`: hidden entries as `scope/name@head`. `None` when absent.
    pub update_dependents: Option<Vec<Id>>,
    pub override_update_dependents: bool,
    pub hash: String,
    pub changed: bool,
}

impl LaneObject {
    /// `Lane.parse(contents, hash)`.
    #[must_use]
    pub fn parse(object: &Value, hash: &str) -> Self {
        let update_dependents = object["updateDependents"]
            .as_array()
            .map(|ids| {
                ids.iter()
                    .filter_map(|id| Id::parse(id.as_str()?).ok())
                    .collect()
            });
        Self {
            name: object["name"]
                .as_str()
                .map_or("", str::trim)
                .to_string(),
            scope: object["scope"]
                .as_str()
                .map_or("", str::trim)
                .to_string(),
            components: components(&object["components"]),
            log: object["log"].clone(),
            readme_component: present(&object["readmeComponent"]),
            forked_from: present(&object["forkedFrom"]),
            schema: object["schema"]
                .as_str()
                .map(str::trim)
                .filter(|val| !val.is_empty())
                .unwrap_or(OLD_LANE_SCHEMA)
                .to_string(),
            update_dependents,
            override_update_dependents: object["overrideUpdateDependents"].as_bool() == Some(true),
            hash: object["hash"]
                .as_str()
                .map(str::trim)
                .filter(|val| !val.is_empty())
                .unwrap_or_else(|| hash.trim())
                .to_string(),
            changed: false,
        }
    }

    /// `Lane.toObject()`: keys in declaration order, falsy values dropped (`pickBy`).
    #[must_use]
    pub fn to_object(&self) -> Value {
        let mut object = Map::new();
        object.insert("name".into(), json!(self.name));
        object.insert("scope".into(), json!(self.scope));
        let components: Vec<Value> = self.components
            .iter()
            .map(|component| {
                let mut entry = json!({
                    "id": { "scope": component.scope, "name": component.name },
                    "head": component.head,
                });
                if component.is_deleted {
                    entry["isDeleted"] = json!(true);
                }
                entry
            })
            .collect();
        object.insert("components".into(), json!(components));
        if truthy(&self.log) {
            object.insert("log".into(), self.log.clone());
        }
        if let Some(readme) = &self.readme_component {
            object.insert("readmeComponent".into(), readme.clone());
        }
        if let Some(forked_from) = &self.forked_from {
            object.insert("forkedFrom".into(), forked_from.clone());
        }
        if !self.schema.is_empty() {
            object.insert("schema".into(), json!(self.schema));
        }
        if let Some(ids) = &self.update_dependents {
            let ids: Vec<String> = ids.iter().map(Id::to_request).collect();
            object.insert("updateDependents".into(), json!(ids));
        }
        if self.override_update_dependents {
            object.insert("overrideUpdateDependents".into(), json!(true));
        }
        Value::Object(object)
    }

    /// `Lane.id()`: `scope/name`.
    #[must_use]
    #[inline]
    pub fn id(&self) -> String {
        format!("{}/{}", self.scope.trim(), self.name.trim())
    }

    #[inline]
    pub fn change_id(&mut self, scope: &str, name: &str) {
        let (scope, name) = (scope.trim(), name.trim());
        if self.scope != scope || self.name != name {
            self.scope = scope.to_string();
            self.name = name.to_string();
            self.changed = true;
        }
    }

    /// `Lane.getComponent`.
    #[must_use]
    #[inline]
    pub fn component(&self, scope: &str, name: &str) -> Option<&LaneComponent> {
        self.components
            .iter()
            .find(|component| component.same_id(scope, name))
    }

    /// `Lane.addComponent`.
    pub fn add_component(&mut self, component: LaneComponent) {
        if let Some(existing) = self.components
            .iter_mut()
            .find(|existing| existing.same_id(&component.scope, &component.name))
        {
            if existing.head != component.head || existing.is_deleted != component.is_deleted {
                self.changed = true;
            }
            *existing = component;
        } else {
            self.components.push(component);
            self.changed = true;
        }
    }

    /// `Lane.removeComponent`.
    pub fn remove_component(&mut self, scope: &str, name: &str) {
        let before = self.components.len();
        self.components.retain(|component| !component.same_id(scope, name));
        if self.components.len() != before {
            self.changed = true;
        }
    }

    /// `Lane.getUpdateDependentAsLaneComponent`: the hidden entry as a lane component.
    #[must_use]
    pub fn update_dependent(&self, scope: &str, name: &str) -> Option<LaneComponent> {
        let (scope, name) = (scope.trim(), name.trim());
        let found = self.update_dependents
            .iter()
            .flatten()
            .find(|id| id.scope.trim() == scope && id.name.trim() == name)?;
        Some(LaneComponent {
            scope: found.scope.clone(),
            name: found.name.clone(),
            head: found.version.clone()?,
            is_deleted: false,
        })
    }

    /// `Lane.removeComponentFromUpdateDependentsIfExist`.
    pub fn remove_update_dependent(&mut self, scope: &str, name: &str) {
        let (scope, name) = (scope.trim(), name.trim());
        let Some(dependents) = &mut self.update_dependents else { return };
        let before = dependents.len();
        dependents.retain(|id| !(id.scope.trim() == scope && id.name.trim() == name));
        if dependents.len() != before {
            if dependents.is_empty() {
                self.update_dependents = None;
            }
            self.changed = true;
        }
    }

    /// `Lane.addComponentToUpdateDependents`.
    pub fn add_update_dependent(&mut self, id: Id) {
        self.remove_update_dependent(&id.scope, &id.name);
        self.update_dependents.get_or_insert_with(Vec::new).push(id);
        self.changed = true;
    }

    /// `Lane.includeDeletedData()`: `schema >= 1.0.0`.
    #[must_use]
    #[inline]
    pub fn includes_deleted_data(&self) -> bool {
        self.schema != OLD_LANE_SCHEMA
    }

    /// `Lane.toComponentIds()`: visible ids at their heads.
    #[must_use]
    #[inline]
    pub fn component_ids(&self) -> Vec<Id> {
        self.components
            .iter()
            .map(|component| Id {
                scope: component.scope.clone(),
                name: component.name.clone(),
                version: Some(component.head.clone()),
            })
            .collect()
    }

    /// `Lane.isEqual`: same id and the same visible entries, ignoring order.
    #[must_use]
    pub fn is_equal(&self, other: &Self) -> bool {
        if self.components.len() != other.components.len() || self.id() != other.id() {
            return false;
        }
        fn normalize(lane: &LaneObject) -> Vec<(&str, &str, &str, bool)> {
            let mut entries: Vec<(&str, &str, &str, bool)> = lane.components
                .iter()
                .map(|entry| {
                    (
                        entry.scope.as_str(),
                        entry.name.as_str(),
                        entry.head.as_str(),
                        entry.is_deleted,
                    )
                })
                .collect();
            entries.sort_unstable();
            entries
        }
        normalize(self) == normalize(other)
    }
}

#[inline]
fn components(value: &Value) -> Vec<LaneComponent> {
    value
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(parse_lane_component)
        .collect()
}

fn parse_lane_component(entry: &Value) -> Option<LaneComponent> {
    if let Some(raw) = entry.as_str() {
        return parse_lane_component_str(raw);
    }
    let head = entry["head"]
        .as_str()
        .map(str::trim)
        .filter(|head| !head.is_empty())?
        .to_string();
    let (scope, name) = if let Some(id_str) = entry["id"].as_str() {
        let id_str = id_str.trim();
        let (sc, nm) = id_str
            .split_once('/')
            .unwrap_or(("", id_str));
        (sc.trim().to_owned(), nm.trim().to_owned())
    } else {
        let sc = entry["id"]["scope"]
            .as_str()
            .or_else(|| entry["scope"].as_str())
            .unwrap_or_default()
            .trim()
            .to_owned();
        let nm = entry["id"]["name"]
            .as_str()
            .or_else(|| entry["name"].as_str())?
            .trim()
            .to_owned();
        (sc, nm)
    };
    (!name.is_empty()).then_some(LaneComponent {
        scope,
        name,
        head,
        is_deleted: entry["isDeleted"].as_bool().unwrap_or(false),
    })
}

fn parse_lane_component_str(raw: &str) -> Option<LaneComponent> {
    let (id_part, head) = raw.trim().rsplit_once('@')?;
    let head = head.trim();
    let (scope, name) = id_part
        .split_once('/')
        .unwrap_or(("", id_part));
    let (scope, name) = (scope.trim(), name.trim());
    (!name.is_empty() && !head.is_empty()).then(|| LaneComponent {
        scope: scope.to_owned(),
        name: name.to_owned(),
        head: head.to_owned(),
        is_deleted: false,
    })
}

#[inline]
fn present(value: &Value) -> Option<Value> {
    truthy(value).then(|| value.clone())
}

/// `pickBy(obj, (val) => !!val)`.
#[inline]
fn truthy(value: &Value) -> bool {
    match value {
        Value::Null | Value::Bool(false) => false,
        Value::String(text) => !text.is_empty(),
        Value::Number(number) => number.as_f64() != Some(0.0),
        _ => true,
    }
}
