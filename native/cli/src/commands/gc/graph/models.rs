//! Workspace collection resolves canonical identities first, then one stored legacy alias.
use super::super::inventory::{ScopeInventory, sorted_dir_entries};
use serde_json::Value;
use sha1::{Digest, Sha1};
use std::{collections::HashMap, fs, path::Path};

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
                    if let (Some(real_scope), Some(name)) = (
                        object.value["realScope"]
                            .as_str()
                            .filter(|val| !val.is_empty()),
                        object.value["name"]
                            .as_str()
                            .filter(|val| !val.is_empty()),
                    ) {
                        aliases.insert(
                            object.hash.clone(),
                            digest(&format!("{real_scope}/{name}")),
                        );
                    }
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
        let name = name.trim();
        let key = scope
            .map(str::trim)
            .filter(|scope| !scope.is_empty())
            .map_or_else(|| name.to_owned(), |scope| format!("{scope}/{name}"));
        self.lookup(&key)
            .or_else(|| {
                (key != name)
                    .then(|| self.lookup(name))
                    .flatten()
            })
    }
    fn lookup(&self, key: &str) -> Option<&Value> {
        self.identities
            .get(key)
            .or_else(|| {
                let hash = digest(key);
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

pub(in crate::commands::gc) fn load_staged_snaps(scope_dir: &Path) -> Vec<String> {
    let Ok(text) = fs::read_to_string(scope_dir.join("staged-snaps")) else {
        return Vec::new();
    };
    if let Ok(Value::Array(items)) = bit_object_import::parse_jsonc(text.as_bytes()) {
        return items
            .iter()
            .filter_map(Value::as_str)
            .map(str::trim)
            .filter(|line| !line.is_empty())
            .map(str::to_owned)
            .collect();
    }
    text.lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .map(str::to_owned)
        .collect()
}

pub(in crate::commands::gc) fn load_stashed_hashes(
    scope_dir: &Path,
) -> Result<Vec<String>, String> {
    let mut hashes = Vec::new();
    for entry_path in sorted_dir_entries(&scope_dir.join("stash")) {
        if entry_path
            .file_name()
            .and_then(|name| name.to_str())
            .is_some_and(|name| name.ends_with(".json"))
            && entry_path.is_file()
        {
            hashes.extend(parse_stash_file(&entry_path)?);
        }
    }
    Ok(hashes)
}

fn parse_stash_file(file_path: &Path) -> Result<Vec<String>, String> {
    let unusable = |reason: &str| {
        format!(
            "unable to read the stash file \"{}\", so it is not safe to run gc.\na stash is the only record of the snaps it holds - they exist nowhere else, and deleting them\ncannot be undone. fix or remove the file and run gc again.\nError: {reason}",
            file_path.display(),
        )
    };
    let text = fs::read_to_string(file_path).map_err(|err| unusable(&err.to_string()))?;
    let val =
        bit_object_import::parse_jsonc(text.as_bytes()).map_err(|err| unusable(&err.to_string()))?;
    let Some(comps_data) = val.get("stashCompsData").and_then(Value::as_array) else {
        return Err(unusable(r#""stashCompsData" is missing or is not an array"#));
    };
    let mut hashes = Vec::with_capacity(comps_data.len());
    for (index, comp_data) in comps_data.iter().enumerate() {
        let Some(hash) = comp_data
            .get("hash")
            .and_then(Value::as_str)
            .filter(|str_val| !str_val.is_empty())
        else {
            return Err(unusable(&format!(
                r#"the entry at index {index} of "stashCompsData" has no "hash""#,
            )));
        };
        hashes.push(hash.to_owned());
    }
    Ok(hashes)
}

pub(in crate::commands::gc) fn load_unmerged_roots(
    scope_dir: &Path,
) -> Result<Vec<String>, String> {
    let unmerged_path = scope_dir.join("unmerged.json");
    if !unmerged_path.exists() {
        return Ok(Vec::new());
    }
    let val =
        bit_object_import::parse_jsonc(&fs::read(&unmerged_path).map_err(|err| err.to_string())?)
            .map_err(|err| err.to_string())?;
    let Some(arr) = val.as_array() else { return Ok(Vec::new()) };
    let mut roots = Vec::new();
    for item in arr {
        collect_unmerged_item(item, &mut roots);
    }
    Ok(roots)
}

fn collect_unmerged_item(item: &Value, roots: &mut Vec<String>) {
    if let Some(head) = item["head"]
        .as_str()
        .filter(|str_val| !str_val.is_empty())
    {
        roots.push(head.to_owned());
    }
    let Some(unrel) = item.get("unrelated").and_then(Value::as_object) else {
        return;
    };
    for key in ["headOnCurrentLane", "unrelatedHead"] {
        if let Some(hash) = unrel.get(key).and_then(Value::as_str) {
            roots.push(hash.to_owned());
        }
    }
}

pub(in crate::commands::gc) fn version_refs_without_parents(ver_val: &Value) -> Vec<String> {
    let mut refs = Vec::new();
    collect_file_refs(&ver_val["files"], &mut refs);
    if let Some(exts) = ver_val["extensions"].as_array() {
        for ext in exts {
            collect_artifact_refs(&ext["artifacts"], &mut refs);
            collect_artifact_refs(&ext["data"]["artifacts"], &mut refs);
        }
    }
    for field in ["flattenedEdgesRef", "dependenciesGraphRef", "flattenedDependenciesRef"] {
        if let Some(hash) = ver_val[field]
            .as_str()
            .filter(|val| !val.is_empty())
        {
            refs.push(hash.to_owned());
        }
    }
    refs
}

fn collect_file_refs(files_val: &Value, refs: &mut Vec<String>) {
    let Some(files) = files_val.as_array() else { return };
    for file in files {
        if let Some(hash) = file["file"]
            .as_str()
            .or_else(|| file["file"]["hash"].as_str())
        {
            refs.push(hash.to_owned());
        }
    }
}

fn collect_artifact_refs(artifacts_val: &Value, refs: &mut Vec<String>) {
    let Some(artifacts) = artifacts_val.as_array() else { return };
    for art in artifacts {
        let Some(arr) = art["files"]["refs"]
            .as_array()
            .or_else(|| art["files"].as_array())
        else {
            continue;
        };
        for item in arr {
            if let Some(hash) = item["ref"]
                .as_str()
                .or_else(|| item["ref"]["hash"].as_str())
                .or_else(|| item["file"].as_str())
            {
                refs.push(hash.to_owned());
            }
        }
    }
}
