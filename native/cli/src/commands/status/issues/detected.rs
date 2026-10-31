//! Detection issue classes from `@teambit/component-issues` 2.2.94.

#[cfg(test)]
mod tests;

use super::{SPACE, array, decline, format::list_or_text, text};
use serde_json::{Value, json};
use std::io;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum Issue {
    Untracked,
    Relative,
    RelativeAuthored,
    Parse,
    Resolve,
    SelfReference,
    ExternalEnv,
    ImportNonMain,
    Legacy,
    MergeConfig,
    LoadFailures,
}

impl Issue {
    pub(super) fn parse(name: &str) -> io::Result<Self> {
        Ok(match name.trim() {
            "UntrackedDependencies" => Self::Untracked,
            "RelativeComponents" => Self::Relative,
            "RelativeComponentsAuthored" => Self::RelativeAuthored,
            "ParseErrors" => Self::Parse,
            "ResolveErrors" => Self::Resolve,
            "SelfReference" => Self::SelfReference,
            "ExternalEnvWithoutVersion" => Self::ExternalEnv,
            "ImportNonMainFiles" => Self::ImportNonMain,
            "LegacyInsideHarmony" => Self::Legacy,
            "MergeConfigHasConflict" => Self::MergeConfig,
            "LoadFailures" => Self::LoadFailures,
            _ => return Err(decline(format!("status issue type {name}"))),
        })
    }

    pub(super) const fn class(self) -> (&'static str, &'static str, &'static str, bool) {
        match self {
            Self::Untracked
            | Self::Relative
            | Self::RelativeAuthored
            | Self::Parse
            | Self::Resolve => self.source_class(),
            _ => self.runtime_class(),
        }
    }

    const fn source_class(self) -> (&'static str, &'static str, &'static str, bool) {
        match self {
            Self::Untracked => (
                "UntrackedDependencies",
                "untracked file dependencies",
                r#"use "bit add <file>" to track untracked files as components"#,
                true,
            ),
            Self::Relative => (
                "RelativeComponents",
                "components with relative import statements found",
                "use module paths for imported components",
                true,
            ),
            Self::RelativeAuthored => (
                "RelativeComponentsAuthored",
                "components with relative import statements found",
                r#"replace to module paths or use "bit link --rewire" to replace"#,
                true,
            ),
            Self::Parse => (
                "ParseErrors",
                "error found while parsing the file",
                "edit the file and fix the parsing error",
                true,
            ),
            Self::Resolve => (
                "ResolveErrors",
                "error found while resolving the file dependencies",
                "see the log for the full error",
                true,
            ),
            _ => unreachable!(),
        }
    }

    const fn runtime_class(self) -> (&'static str, &'static str, &'static str, bool) {
        match self {
            Self::SelfReference => (
                "SelfReference",
                "a component has an import statement that points to itself",
                "edit the file and change the import statement to a relative path",
                true,
            ),
            Self::ExternalEnv => (
                "ExternalEnvWithoutVersion",
                "failed loading env - external env without a version",
                "",
                true,
            ),
            Self::ImportNonMain => (
                "ImportNonMainFiles",
                "importing non-main files",
                "the dependency should expose its API from the main file",
                true,
            ),
            Self::Legacy => (
                "LegacyInsideHarmony",
                "legacy component inside Harmony workspace",
                "remove the component and re-create it via Harmony",
                true,
            ),
            Self::MergeConfig => (
                "MergeConfigHasConflict",
                "merge-conflict file has unresolved conflicts",
                "edit the merge-conflict file in the workspace root and resolve the conflicts",
                true,
            ),
            Self::LoadFailures => (
                "LoadFailures",
                "failed loading some aspects/envs of this component (the load continued without them)",
                r#"see the error details below, often resolved by running "bit install" or "bit compile""#,
                false,
            ),
            _ => unreachable!(),
        }
    }

    pub(super) fn deserialize(self, mut data: Value) -> io::Result<Value> {
        if !matches!(self, Self::Relative | Self::RelativeAuthored) {
            return Ok(data);
        }
        let files = data.as_object_mut().ok_or_else(|| decline("relative component issue data"))?;
        for entries in files.values_mut() {
            let entries = entries
                .as_array_mut()
                .ok_or_else(|| decline("relative component issue entries"))?;
            for entry in entries {
                match self {
                    Self::Relative => *entry = json!({"_legacy":entry.clone()}),
                    Self::RelativeAuthored => {
                        entry["componentId"] = component_id(&entry["componentId"])?;
                    }
                    _ => unreachable!(),
                }
            }
        }
        Ok(data)
    }

    pub(super) fn data_to_string(self, data: &Value) -> io::Result<String> {
        match self {
            Self::Untracked => untracked(data),
            Self::ExternalEnv => Ok(format!("{SPACE}{}", text(data.get("envId"))?)),
            Self::LoadFailures => load_failures(data),
            _ => file_data(data, |value| self.file_value(value)),
        }
    }

    fn file_value(self, value: &Value) -> io::Result<String> {
        match self {
            Self::Relative => Ok(array(Some(value), "relative issues")?
                .iter()
                .map(|_| "[object Object]")
                .collect::<Vec<_>>()
                .join(", ")),
            Self::RelativeAuthored => array(Some(value), "relative authored issues")?
                .iter()
                .map(|entry| {
                    let mut value = entry["componentId"]["_legacy"].clone();
                    if let Some(scope) = entry["componentId"].get("_scope") {
                        value["scope"] = scope.clone();
                    }
                    let id = crate::commands::ids::Id::from_object(&value)?;
                    Ok(format!(r#""{}" ({})"#, text(entry.get("importSource"))?, id.display()))
                })
                .collect::<io::Result<Vec<_>>>()
                .map(|values| values.join(", ")),
            _ => list_or_text(value),
        }
    }
}

fn legacy(id: &Value) -> io::Result<Value> {
    let id = id.get("_legacy").unwrap_or(id);
    let mut legacy = serde_json::Map::new();
    for key in ["scope", "name", "version"] {
        if let Some(value) = id.get(key) {
            legacy.insert(key.to_string(), value.clone());
        }
    }
    if !legacy.contains_key("name") {
        return Err(decline("relative component id without name"));
    }
    Ok(Value::Object(legacy))
}

fn file_data(data: &Value, format: impl Fn(&Value) -> io::Result<String>) -> io::Result<String> {
    if data.is_boolean() {
        return Ok(String::new());
    }
    let files = data.as_object().ok_or_else(|| decline("detection issue file data"))?;
    files
        .iter()
        .map(|(file, value)| Ok(format!("{SPACE}{file} -> {}", format(value)?)))
        .collect::<io::Result<Vec<_>>>()
        .map(|rows| rows.join("\n"))
}

fn untracked(data: &Value) -> io::Result<String> {
    let files = data.as_object().ok_or_else(|| decline("untracked dependency issue data"))?;
    files
        .iter()
        .map(|(file, value)| {
            let space = if value["nested"] == true { "            " } else { SPACE };
            let files = array(value.get("untrackedFiles"), "untracked files")?
                .iter()
                .map(|file| text(file.get("relativePath")))
                .collect::<io::Result<Vec<_>>>()?;
            Ok(format!("{space}{file} -> {}", files.join(", ")))
        })
        .collect::<io::Result<Vec<_>>>()
        .map(|rows| rows.join("\n"))
}

fn load_failures(data: &Value) -> io::Result<String> {
    array(Some(data), "aspect load failures")?
        .iter()
        .map(|entry| {
            Ok(format!(
                "{SPACE}{} (during {}) -> {}",
                text(entry.get("failedId"))?,
                text(entry.get("phase"))?,
                text(entry.get("error"))?,
            ))
        })
        .collect::<io::Result<Vec<_>>>()
        .map(|rows| rows.join("\n"))
}

fn component_id(original: &Value) -> io::Result<Value> {
    let mut id = json!({"_legacy":legacy(original)?});
    if let Some(scope) = original.get("_scope") {
        id["_scope"] = scope.clone();
    }
    Ok(id)
}
