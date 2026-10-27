//! Workspace collection resolves canonical identities first, then one stored legacy alias.
use super::super::inventory::ScopeInventory;
use serde_json::Value;
use sha1::{Digest, Sha1};
use std::collections::HashMap;

pub(in crate::commands::gc) struct Models {
    identities: HashMap<String, Value>,
    hashes: HashMap<String, Value>,
    aliases: HashMap<String, String>,
}
impl Models {
    pub(super) fn new(inventory: &ScopeInventory) -> Self {
        let mut identities = HashMap::new();
        let mut hashes = HashMap::new();
        let mut aliases = HashMap::new();
        for object in &inventory.objects {
            match object.kind.as_str() {
                "Component" => {
                    identities.insert(super::comp_value_key(&object.value), object.value.clone());
                    hashes.insert(object.hash.clone(), object.value.clone());
                }
                "Symlink" => {
                    aliases.insert(
                        object.hash.clone(),
                        digest(&format!(
                            "{}/{}",
                            object.value["realScope"].as_str().unwrap(),
                            object.value["name"].as_str().unwrap(),
                        )),
                    );
                }
                _ => {}
            }
        }
        Self { identities, hashes, aliases }
    }
    pub(in crate::commands::gc) fn contains_key(&self, key: &str) -> bool {
        self.identities.contains_key(key)
    }
    pub(super) fn get(&self, scope: Option<&str>, name: &str) -> Option<&Value> {
        let key = scope
            .filter(|scope| !scope.is_empty())
            .map_or_else(|| name.to_owned(), |scope| format!("{scope}/{name}"));
        self.identities
            .get(&key)
            .or_else(|| {
                let hash = digest(&key);
                self.hashes.get(self.aliases.get(&hash).unwrap_or(&hash))
            })
    }
}

pub(in crate::commands::gc) fn normalize(inventory: &mut ScopeInventory) -> Result<(), String> {
    for object in &mut inventory.objects {
        if matches!(object.kind.as_str(), "Component" | "Symlink") {
            normalize_name(&mut object.value)?;
        }
    }
    let kinds: HashMap<_, _> = inventory.objects
        .iter()
        .map(|object| (object.hash.as_str(), object.kind.as_str()))
        .collect();
    for object in inventory.objects
        .iter()
        .filter(|object| object.kind == "Symlink")
    {
        let target = digest(&format!(
            "{}/{}",
            text(&object.value["realScope"])?,
            text(&object.value["name"])?,
        ));
        if kinds.get(target.as_str()) != Some(&"Component") {
            return Err("legacy workspace alias target requires the published runtime".into());
        }
    }
    Ok(())
}
fn normalize_name(value: &mut Value) -> Result<(), String> {
    let name = text(&value["name"])?;
    if crate::commands::status::js::truthy(value.get("box")) {
        value["name"] = Value::String(format!("{}/{name}", text(&value["box"])?));
    }
    Ok(())
}
fn text(value: &Value) -> Result<&str, String> {
    value
        .as_str()
        .filter(|value| !value.is_empty())
        .ok_or_else(|| "legacy workspace model metadata requires the published runtime".into())
}
fn digest(value: &str) -> String {
    format!("{:x}", Sha1::digest(value.as_bytes()))
}
