use super::{DEPENDENCY_RESOLVER_ASPECT, ENVS_ASPECT};
use indexmap::IndexMap;
use serde_json::{Map, Value};
use std::{fs, io, path::Path};

const FILE_NAME: &str = "merge-conflict";
const ID_PREFIX: &str = "[*]";
const WORKSPACE_ID: &str = "WORKSPACE";
const POLICY_FIELDS: [&str; 3] = ["dependencies", "devDependencies", "peerDependencies"];

/// The config-merge file a lane merge leaves at the workspace root
/// (`merge-conflict`, `MergeConflictFile`): one JSON config per component id
/// (without version), plus the deprecated `WORKSPACE` entry and any resolved
/// `mergedConfig` entries in `<scope>/unmerged.json`.
#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub struct MergeConfig {
    conflicts: IndexMap<String, String>,
    unmerged: IndexMap<String, Value>,
}

/// A component's config-merge entry after `adjustEnvsOnConfigObject` and
/// `extractAutoDepsFromConfig`.
#[derive(Debug, Default, Clone, PartialEq)]
pub struct MergeConfigComponent {
    /// Aspect id → config. The dependency-resolver policy keeps only `force`
    /// entries, as objects.
    pub config: Map<String, Value>,
    /// The non-`force` policy entries per field: they override auto-detected
    /// dependencies (`getDepsDataOfMergeConfig`).
    pub auto_deps: Map<String, Value>,
}

impl MergeConfig {
    pub fn load(root: &Path) -> io::Result<Self> {
        let mut config = match fs::read_to_string(root.join(FILE_NAME)) {
            Ok(text) => Self::parse(&text),
            Err(error) if error.kind() == io::ErrorKind::NotFound => Self::default(),
            Err(error) => return Err(error),
        };
        config.unmerged = load_unmerged(&super::scope_path(root))?;
        Ok(config)
    }

    /// `parseConflict`: drop divider and `#` lines, then split by `[*]`.
    #[must_use]
    pub fn parse(text: &str) -> Self {
        let divider = "-".repeat(80);
        let kept: Vec<&str> = text
            .split('\n')
            .filter(|line| *line != divider && !line.starts_with('#'))
            .collect();
        let joined = kept.join("\n");
        let conflicts = joined
            .split(ID_PREFIX)
            .filter_map(|item| {
                let (raw_id, rest) = item
                    .split_once('\n')
                    .unwrap_or((item, ""));
                let id = raw_id.trim();
                (!id.is_empty()).then(|| (id.to_owned(), rest.to_owned()))
            })
            .collect();
        Self { conflicts, unmerged: IndexMap::new() }
    }

    #[must_use]
    pub fn is_empty(&self) -> bool {
        self.conflicts.is_empty() && self.unmerged.is_empty()
    }

    /// `getConflictParsed`. `Ok(None)` when there is no entry or it still has
    /// conflict markers (Bit logs those and ignores the entry); invalid JSON
    /// without markers is an error.
    fn parsed(&self, id: &str) -> io::Result<Option<Value>> {
        let Some(content) = self.conflicts
            .get(id)
            .filter(|content| !content.is_empty())
        else {
            return Ok(None);
        };
        match crate::jsonc::parse(content) {
            Ok(value) => Ok(Some(value)),
            Err(_) if content.contains("<<<<<<<") || content.contains(">>>>>>>") => Ok(None),
            Err(error) => Err(io::Error::new(
                io::ErrorKind::InvalidData,
                format!(
                    "unable to parse the merge-conflict entry for {id} as the JSON is invalid. err: {error}",
                ),
            )),
        }
    }

    /// The parsed component entry before environment and auto-policy normalization.
    pub fn raw_component(&self, id: &str) -> io::Result<Option<Value>> {
        self.parsed(id)
    }

    /// Whether an entry is unparseable because merge markers remain.
    #[must_use]
    pub fn has_conflict(&self, id: &str) -> bool {
        self.conflicts
            .get(id)
            .is_some_and(|content| {
                crate::jsonc::parse(content).is_err()
                    && (content.contains("<<<<<<<") || content.contains(">>>>>>>"))
            })
    }

    /// The entry of a component, by id without version.
    pub fn component(&self, id: &str) -> io::Result<Option<MergeConfigComponent>> {
        let combined = match (self.parsed(id)?, self.unmerged.get(id).cloned()) {
            (None, None) => return Ok(None),
            (Some(value), None) | (None, Some(value)) => value,
            (Some(mut left), Some(right)) => {
                merge_values(&mut left, &right);
                left
            }
        };
        let Value::Object(mut config) = combined else { return Ok(None) };
        adjust_envs(&mut config);
        let auto_deps = extract_auto_deps(&mut config);
        Ok(Some(MergeConfigComponent { config, auto_deps }))
    }

    /// The deprecated `WORKSPACE` entry's dependency-resolver policy, with its
    /// `[{ name, version }]` arrays as objects.
    pub fn workspace_policy(&self) -> io::Result<Option<Map<String, Value>>> {
        let Some(data) = self.parsed(WORKSPACE_ID)? else { return Ok(None) };
        let Some(Value::Object(mut policy)) = data
            .get(DEPENDENCY_RESOLVER_ASPECT)
            .and_then(|dr| dr.get("policy"))
            .cloned()
        else {
            return Ok(Some(Map::new()));
        };
        for field in ["dependencies", "peerDependencies"] {
            if let Some(Value::Array(entries)) = policy.get(field) {
                let object = entries_to_object(entries.iter());
                policy.insert(field.to_owned(), Value::Object(object));
            }
        }
        Ok(Some(policy))
    }
}

fn load_unmerged(scope: &Path) -> io::Result<IndexMap<String, Value>> {
    let text = match fs::read_to_string(scope.join("unmerged.json")) {
        Ok(text) => text,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(IndexMap::new()),
        Err(error) => return Err(error),
    };
    let Value::Array(entries) = crate::jsonc::parse(&text)? else {
        return Ok(IndexMap::new());
    };
    let mut unmerged = IndexMap::new();
    for entry in entries {
        let Some(id) = unmerged_id(&entry["id"]) else { continue };
        if let Some(config) = entry.get("mergedConfig").filter(|config| config.is_object()) {
            unmerged.insert(id, config.clone());
        }
    }
    Ok(unmerged)
}

fn unmerged_id(id: &Value) -> Option<String> {
    if let Some(raw) = id
        .as_str()
        .filter(|raw| !raw.is_empty())
    {
        return Some(
            raw.split('@')
                .next()
                .unwrap_or(raw)
                .to_owned(),
        );
    }
    let name = id
        .get("name")?
        .as_str()
        .filter(|name| !name.is_empty())?;
    match id
        .get("scope")
        .and_then(Value::as_str)
        .filter(|scope| !scope.is_empty())
    {
        Some(scope) => Some(format!("{scope}/{name}")),
        None => Some(name.to_owned()),
    }
}

fn merge_values(target: &mut Value, incoming: &Value) {
    if let (Some(left), Some(right)) = (target.as_array_mut(), incoming.as_array()) {
        left.extend(right.iter().cloned());
    } else if let (Some(left), Some(right)) = (target.as_object_mut(), incoming.as_object()) {
        for (name, value) in right {
            match left.get_mut(name) {
                Some(existing) => merge_values(existing, value),
                None => {
                    left.insert(name.clone(), value.clone());
                }
            }
        }
    } else {
        *target = incoming.clone();
    }
}

/// `adjustEnvsOnConfigObject`: `{ env: "x@1" }` becomes `{ env: "x" }` plus a `"x@1": {}` entry.
fn adjust_envs(config: &mut Map<String, Value>) {
    let Some(env) = config
        .get(ENVS_ASPECT)
        .and_then(|envs| envs.get("env"))
        .and_then(Value::as_str)
    else {
        return;
    };
    let env = env.to_owned();
    let id = env
        .split('@')
        .next()
        .unwrap_or_default()
        .to_owned();
    config.insert(ENVS_ASPECT.to_owned(), serde_json::json!({ "env": id }));
    config.insert(env, Value::Object(Map::new()));
}

/// `extractAutoDepsFromConfig`: split array-form policy fields into `force`
/// entries (kept, as an object) and the rest (returned).
fn extract_auto_deps(config: &mut Map<String, Value>) -> Map<String, Value> {
    let mut auto_deps = Map::new();
    let Some(Value::Object(policy)) = config
        .get_mut(DEPENDENCY_RESOLVER_ASPECT)
        .and_then(|dr| dr.get_mut("policy"))
    else {
        return auto_deps;
    };
    for field in POLICY_FIELDS {
        let Some(Value::Array(entries)) = policy.get(field) else { continue };
        let force = |entry: &&Value| entry.get("force").is_some_and(truthy);
        let (forced, auto): (Vec<&Value>, Vec<&Value>) = entries.iter().partition(force);
        auto_deps.insert(field.to_owned(), Value::Array(auto.into_iter().cloned().collect()));
        if forced.is_empty() {
            policy.remove(field);
        } else {
            let object = entries_to_object(forced.into_iter());
            policy.insert(field.to_owned(), Value::Object(object));
        }
    }
    auto_deps
}

fn entries_to_object<'a>(entries: impl Iterator<Item = &'a Value>) -> Map<String, Value> {
    entries
        .filter_map(|entry| {
            let name = entry.get("name")?.as_str()?;
            Some((
                name.to_owned(),
                entry
                    .get("version")
                    .cloned()
                    .unwrap_or(Value::Null),
            ))
        })
        .collect()
}

/// JavaScript truthiness.
pub(crate) fn truthy(value: &Value) -> bool {
    match value {
        Value::Null => false,
        Value::Bool(value) => *value,
        Value::Number(number) => number
            .as_f64()
            .is_some_and(|number| number != 0.0 && !number.is_nan()),
        Value::String(value) => !value.is_empty(),
        Value::Array(_) | Value::Object(_) => true,
    }
}
