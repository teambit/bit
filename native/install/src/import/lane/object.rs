//! The Lane model (`scopes/scope/objects/models/lane.ts`): parsing, the
//! mutations the import merge uses, and `toObject()` serialization.

use crate::import::bitmap::Id;
use serde_json::{Map, Value, json};

/// Lanes without `isDeleted` data (the old lane schema in TypeScript).
pub const OLD_LANE_SCHEMA: &str = "0.0.0";

/// A visible lane entry.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LaneComponent {
    pub scope: String,
    pub name: String,
    pub head: String,
    pub is_deleted: bool,
}

impl LaneComponent {
    fn same_id(&self, scope: &str, name: &str) -> bool {
        self.scope == scope && self.name == name
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
                .unwrap_or_default()
                .to_string(),
            scope: object["scope"]
                .as_str()
                .unwrap_or_default()
                .to_string(),
            components: components(&object["components"]),
            log: object["log"].clone(),
            readme_component: present(&object["readmeComponent"]),
            forked_from: present(&object["forkedFrom"]),
            schema: object["schema"]
                .as_str()
                .unwrap_or(OLD_LANE_SCHEMA)
                .to_string(),
            update_dependents,
            override_update_dependents: object["overrideUpdateDependents"].as_bool() == Some(true),
            hash: object["hash"]
                .as_str()
                .unwrap_or(hash)
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
    pub fn id(&self) -> String {
        format!("{}/{}", self.scope, self.name)
    }

    pub fn change_id(&mut self, scope: &str, name: &str) {
        self.scope = scope.to_string();
        self.name = name.to_string();
        self.changed = true;
    }

    /// `Lane.getComponent`.
    #[must_use]
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
        if self.component(scope, name).is_none() {
            return;
        }
        self.components.retain(|component| !component.same_id(scope, name));
        self.changed = true;
    }

    /// `Lane.getUpdateDependentAsLaneComponent`: the hidden entry as a lane component.
    #[must_use]
    pub fn update_dependent(&self, scope: &str, name: &str) -> Option<LaneComponent> {
        let found = self.update_dependents
            .iter()
            .flatten()
            .find(|id| id.scope == scope && id.name == name)?;
        Some(LaneComponent {
            scope: found.scope.clone(),
            name: found.name.clone(),
            head: found.version.clone()?,
            is_deleted: false,
        })
    }

    /// `Lane.removeComponentFromUpdateDependentsIfExist`.
    pub fn remove_update_dependent(&mut self, scope: &str, name: &str) {
        if self.update_dependent(scope, name).is_none() {
            return;
        }
        let remaining: Vec<Id> = self.update_dependents
            .take()
            .into_iter()
            .flatten()
            .filter(|id| !(id.scope == scope && id.name == name))
            .collect();
        self.update_dependents = (!remaining.is_empty()).then_some(remaining);
        self.changed = true;
    }

    /// `Lane.addComponentToUpdateDependents`.
    pub fn add_update_dependent(&mut self, id: Id) {
        self.remove_update_dependent(&id.scope, &id.name);
        self.update_dependents.get_or_insert_with(Vec::new).push(id);
        self.changed = true;
    }

    /// `Lane.includeDeletedData()`: `schema >= 1.0.0`.
    #[must_use]
    pub fn includes_deleted_data(&self) -> bool {
        self.schema != OLD_LANE_SCHEMA
    }

    /// `Lane.toComponentIds()`: visible ids at their heads.
    #[must_use]
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
        if self.id() != other.id() {
            return false;
        }
        let normalize = |lane: &Self| {
            let mut entries: Vec<(String, String, bool)> = lane.components
                .iter()
                .map(|entry| {
                    (
                        format!("{}/{}", entry.scope, entry.name),
                        entry.head.clone(),
                        entry.is_deleted,
                    )
                })
                .collect();
            entries.sort();
            entries
        };
        normalize(self) == normalize(other)
    }
}

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
        let (id_part, head) = raw.rsplit_once('@')?;
        let (scope, name) = id_part
            .split_once('/')
            .unwrap_or(("", id_part));
        return (!name.is_empty() && !head.is_empty()).then(|| LaneComponent {
            scope: scope.to_owned(),
            name: name.to_owned(),
            head: head.to_owned(),
            is_deleted: false,
        });
    }
    let head = entry["head"].as_str()?.to_string();
    let (scope, name) = if let Some(id_str) = entry["id"].as_str() {
        let (sc, nm) = id_str
            .split_once('/')
            .unwrap_or(("", id_str));
        (sc.to_owned(), nm.to_owned())
    } else {
        let sc = entry["id"]["scope"]
            .as_str()
            .or_else(|| entry["scope"].as_str())
            .unwrap_or_default()
            .to_owned();
        let nm = entry["id"]["name"]
            .as_str()
            .or_else(|| entry["name"].as_str())?
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

fn present(value: &Value) -> Option<Value> {
    truthy(value).then(|| value.clone())
}

/// `pickBy(obj, (val) => !!val)`.
fn truthy(value: &Value) -> bool {
    match value {
        Value::Null | Value::Bool(false) => false,
        Value::String(text) => !text.is_empty(),
        Value::Number(number) => number.as_f64() != Some(0.0),
        _ => true,
    }
}
