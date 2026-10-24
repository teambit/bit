#![cfg_attr(dylint_lib = "perfectionist", feature(register_tool))]
#![cfg_attr(dylint_lib = "perfectionist", register_tool(perfectionist))]
//! Published `ConfigGetter` layering shared by native commands, installation and transport.
pub mod glob;
pub mod jsonc;
pub mod package_json;
pub mod variants;

pub use global::{config_string, read_global_config, read_global_config_with};
pub use paths::{cache_root, global_config_dir};
pub use scope::render_scope_json;

mod global;
mod paths;
mod scope;

use serde_json::{Map, Value};
use std::io;

/// Preserve JavaScript object insertion order while later stores replace earlier values.
#[must_use]
pub fn merge_layers(global: &Value, scope: &Value, workspace: &Value) -> Map<String, Value> {
    let mut combined = Map::new();
    for layer in [global, scope, workspace] {
        if let Some(values) = layer.as_object() {
            combined.extend(
                values
                    .iter()
                    .map(|(key, value)| (key.clone(), value.clone())),
            );
        }
    }
    combined
}

/// `toEnvVariableName` replaces periods only; hyphens remain significant.
#[must_use]
pub fn environment_key(key: &str) -> String {
    format!("BIT_CONFIG_{}", key.replace('.', "_").to_uppercase())
}

/// Empty environment variables do not override a configured value.
#[must_use]
pub fn environment_value(key: &str) -> Option<String> {
    std::env::var(environment_key(key))
        .ok()
        .filter(|value| !value.is_empty())
}

/// Materialize environment overrides for known consumers; listConfig itself excludes them.
#[must_use]
pub fn effective(
    global: &Value,
    scope: &Value,
    workspace: &Value,
    known_keys: &[&str],
) -> Map<String, Value> {
    effective_with_environment(global, scope, workspace, known_keys, |key| std::env::var(key).ok())
}

/// Resolve the same layers against an explicit environment, without mutating process state.
#[must_use]
pub fn effective_with_environment(
    global: &Value,
    scope: &Value,
    workspace: &Value,
    known_keys: &[&str],
    environment: impl Fn(&str) -> Option<String>,
) -> Map<String, Value> {
    let mut values = merge_layers(global, scope, workspace);
    let keys = values
        .keys()
        .cloned()
        .chain(known_keys.iter().map(|key| (*key).to_owned()))
        .collect::<std::collections::BTreeSet<_>>();
    for key in keys {
        if let Some(value) = environment(&environment_key(&key)).filter(|value| !value.is_empty()) {
            values.insert(key, Value::String(value));
        }
    }
    values
}

/// JavaScript truthiness used by config get's `value || ''` report.
#[must_use]
pub fn truthy(value: &Value) -> bool {
    match value {
        Value::Null => false,
        Value::Bool(value) => *value,
        Value::Number(value) => value
            .as_f64()
            .is_some_and(|number| number != 0.0),
        Value::String(value) => !value.is_empty(),
        Value::Array(_) | Value::Object(_) => true,
    }
}

/// Plain JSONC values using the shared comment-preserving parser.
pub fn parse_jsonc(bytes: &[u8]) -> io::Result<Value> {
    jsonc::parse(std::str::from_utf8(bytes).map_err(io::Error::other)?)
}

/// Consumer._getScopePath prefers .bit; only an actual .git directory embeds its scope.
#[must_use]
pub fn scope_path(root: &std::path::Path) -> std::path::PathBuf {
    let hidden = root.join(".bit");
    let git = root.join(".git");
    if git.is_dir()
        && (!hidden.exists() || (!hidden.join("objects").is_dir() && git.join("bit").is_dir()))
    {
        git.join("bit")
    } else {
        hidden
    }
}

/// Locate the closest parent workspace.jsonc from an invocation directory.
#[must_use]
pub fn workspace_root(cwd: &std::path::Path) -> Option<std::path::PathBuf> {
    cwd.ancestors()
        .find(|path| path.join("workspace.jsonc").is_file())
        .map(std::path::Path::to_owned)
}

#[cfg(test)]
mod tests;

/// Workspace.getConfigStore lists the first matching version-insensitive config-store aspect.
#[must_use]
pub fn workspace_values(workspace: &Value) -> Map<String, Value> {
    workspace
        .get(workspace_store_key(workspace))
        .and_then(Value::as_object)
        .cloned()
        .unwrap_or_default()
}

/// Preserve the configured aspect identity for comment-preserving edits.
#[must_use]
pub fn workspace_store_key(workspace: &Value) -> &str {
    const ASPECT: &str = "teambit.harmony/config-store";
    workspace
        .as_object()
        .and_then(|values| {
            values
                .keys()
                .find(|key| *key == ASPECT || key.starts_with("teambit.harmony/config-store@"))
        })
        .map_or(ASPECT, String::as_str)
}
