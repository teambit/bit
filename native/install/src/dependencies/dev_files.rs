//! Dev files of a [`WorkspaceComponent`] (`DevFilesMain.computeDevPatterns` + `computeDevFiles`).
//!
//! The patterns are composed per aspect id: the component's [`DEV_FILES`]
//! config, the [`TESTER`], [`DOCS`], and [`COMPOSITIONS`] registrations ([`DevPatternConfig`],
//! plus what the env's `getTestsDevPatterns()`/`getDocsDevPatterns()`/
//! `getCompositionsDevPatterns()` add), then the env's own patterns, which replace
//! an aspect's entry of the same name: [`EnvJsoncReader`] `patterns` for a non-core env, else
//! the env's `getDevPatterns()`. A dev file is one matching any aspect's patterns via [`glob`].

use super::glob;
use crate::{
    host::Host,
    model::WorkspaceComponent,
    policy::{EnvJsoncReader, is_core_env, split_version},
};
use indexmap::IndexMap;
use serde_json::Value;
use std::{collections::HashMap, io};

/// Aspect ID of the built-in tester aspect (`teambit.defender/tester`) in [`DevPatternConfig`].
const TESTER: &str = "teambit.defender/tester";
/// Aspect ID of the built-in docs aspect (`teambit.docs/docs`).
const DOCS: &str = "teambit.docs/docs";
/// Aspect ID of the built-in compositions aspect (`teambit.compositions/compositions`).
const COMPOSITIONS: &str = "teambit.compositions/compositions";
/// Aspect ID of the built-in dev-files aspect (`teambit.component/dev-files`).
const DEV_FILES: &str = "teambit.component/dev-files";

/// The workspace configuration of the dev-pattern registrars (`workspace.jsonc`
/// aspect config, defaulting to each aspect's `defaultConfig`).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DevPatternConfig {
    /// `teambit.defender/tester` `patterns`.
    pub tests: Vec<String>,
    /// `teambit.docs/docs` `patterns`.
    pub docs: Vec<String>,
    /// `teambit.compositions/compositions` `compositionFilePattern`.
    pub compositions: Vec<String>,
}

impl Default for DevPatternConfig {
    /// Return the default [`TESTER`], [`DOCS`], and [`COMPOSITIONS`] glob patterns.
    fn default() -> Self {
        Self {
            tests: strings_of(&["**/*.spec.+(js|ts|jsx|tsx)", "**/*.test.+(js|ts|jsx|tsx)"]),
            docs: strings_of(&["**/*.docs.*"]),
            compositions: strings_of(&["**/*.composition?(s).*"]),
        }
    }
}

impl DevPatternConfig {
    /// From the top-level `workspace.jsonc` aspect configs.
    #[must_use]
    pub fn from_aspects(aspect: &dyn Fn(&str) -> Option<Value>) -> Self {
        let defaults = Self::default();
        let configured =
            |id: &str, key: &str| aspect(id).and_then(|config| config.get(key).map(strings));
        Self {
            tests: configured(TESTER, "patterns").unwrap_or(defaults.tests),
            docs: configured(DOCS, "patterns").unwrap_or(defaults.docs),
            compositions: configured(COMPOSITIONS, "compositionFilePattern")
                .unwrap_or(defaults.compositions),
        }
    }
}

/// What one env contributes: its `env.jsonc` `patterns` or `getDevPatterns()`, and
/// the per-registrar hooks.
#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub struct EnvDevPatterns {
    pub patterns: Option<Value>,
    pub tests: Option<Vec<String>>,
    pub docs: Option<Vec<String>>,
    pub compositions: Option<Vec<String>>,
}

/// Loads each env's [`EnvDevPatterns`] once using [`EnvJsoncReader`] and [`Host`].
pub struct EnvPatterns<'a> {
    /// The workspace configuration of the registrars.
    pub config: &'a DevPatternConfig,
    reader: &'a EnvJsoncReader<'a>,
    host: &'a dyn Host,
    cache: HashMap<String, EnvDevPatterns>,
}

impl<'a> EnvPatterns<'a> {
    /// Construct a cached [`EnvPatterns`] loader backed by `reader`, `host`, and workspace `config`.
    #[inline]
    pub fn new(
        reader: &'a EnvJsoncReader<'a>,
        host: &'a dyn Host,
        config: &'a DevPatternConfig,
    ) -> Self {
        Self { config, reader, host, cache: HashMap::new() }
    }

    /// The patterns of `env_id`.
    pub async fn get(&mut self, env_id: &str) -> io::Result<EnvDevPatterns> {
        let env_id = env_id.trim();
        if let Some(patterns) = self.cache.get(env_id) {
            return Ok(patterns.clone());
        }
        let patterns = self.load(env_id).await?;
        self.cache.insert(env_id.to_owned(), patterns.clone());
        Ok(patterns)
    }

    /// `computeDevPatternsFromEnv`: `env.jsonc` `patterns` of a non-core env, else
    /// `getDevPatterns()`; the registrar hooks always come from the env object.
    async fn load(&self, env_id: &str) -> io::Result<EnvDevPatterns> {
        let from_manifest = if is_core_env(env_id) {
            None
        } else {
            self.reader
                .resolved(env_id)?
                .and_then(|manifest| manifest.get("patterns").cloned())
        };
        let from_host = self.host.dev_patterns(split_version(env_id).0).await?;
        let hook = |name: &str| {
            from_host
                .as_ref()
                .and_then(|value| value.get(name))
                .filter(|value| !value.is_null())
                .map(strings)
        };
        Ok(EnvDevPatterns {
            tests: hook("tests"),
            docs: hook("docs"),
            compositions: hook("compositions"),
            patterns: from_manifest.or_else(|| {
                from_host
                    .as_ref()
                    .and_then(|value| value.get("devPatterns"))
                    .filter(|value| !value.is_null())
                    .cloned()
            }),
        })
    }
}

/// `computeDevPatterns`: patterns by aspect id, in `Object.assign` order.
#[must_use]
pub fn dev_patterns(
    component: &WorkspaceComponent,
    config: &DevPatternConfig,
    env: &EnvDevPatterns,
) -> IndexMap<String, Vec<String>> {
    let mut patterns: IndexMap<String, Vec<String>> = IndexMap::with_capacity(5);
    patterns.insert("config".to_owned(), configured_dev_patterns(component));
    patterns.insert(TESTER.to_owned(), env.tests.clone().unwrap_or_else(|| config.tests.clone()));
    for (aspect, env_list, cfg_list) in
        [(DOCS, &env.docs, &config.docs), (COMPOSITIONS, &env.compositions, &config.compositions)]
    {
        let mut combined = env_list.clone().unwrap_or_default();
        combined.extend(cfg_list.iter().cloned());
        patterns.insert(aspect.to_owned(), combined);
    }
    let env_id = split_version(&component.env_id).0.trim();
    match &env.patterns {
        Some(Value::Object(named)) => {
            for (name, value) in named {
                let aspect = match name.trim() {
                    "tests" => TESTER,
                    "docs" => DOCS,
                    "compositions" => COMPOSITIONS,
                    _ => env_id,
                };
                patterns
                    .entry(aspect.to_owned())
                    .or_default()
                    .extend(strings(value));
            }
        }
        Some(value) => {
            patterns.insert(env_id.to_owned(), strings(value));
        }
        None => {}
    }
    patterns
}

#[inline]
fn configured_dev_patterns(component: &WorkspaceComponent) -> Vec<String> {
    component.config
        .get(DEV_FILES)
        .or_else(|| {
            component.config
                .iter()
                .find_map(|(id, cfg)| (split_version(id).0.trim() == DEV_FILES).then_some(cfg))
        })
        .and_then(|config| config.get("devFilePatterns"))
        .map(strings)
        .unwrap_or_default()
}

/// `computeDevFiles(...).list()`: the component files matching any aspect's patterns.
#[inline]
#[must_use]
pub fn dev_files(
    component: &WorkspaceComponent,
    patterns: &IndexMap<String, Vec<String>>,
) -> Vec<String> {
    component.files
        .iter()
        .filter(|file| {
            patterns
                .values()
                .any(|patterns| !patterns.is_empty() && glob::match_patterns(file, patterns))
        })
        .cloned()
        .collect()
}

#[inline]
fn strings(value: &Value) -> Vec<String> {
    match value {
        Value::Array(items) => items
            .iter()
            .filter_map(Value::as_str)
            .map(str::trim)
            .filter(|item| !item.is_empty())
            .map(str::to_owned)
            .collect(),
        Value::String(text) if !text.trim().is_empty() => vec![text.trim().to_owned()],
        _ => Vec::new(),
    }
}

#[inline]
fn strings_of(items: &[&str]) -> Vec<String> {
    items
        .iter()
        .map(|item| (*item).to_owned())
        .collect()
}
