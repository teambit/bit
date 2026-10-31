//! Which dependency build scripts may run (`resolveScriptPolicies` in `lynx.ts`).

#[cfg(test)]
mod tests;

use crate::config::DependencyResolverConfig;
use indexmap::IndexMap;
use serde_json::Value;
use std::{collections::BTreeMap, io, sync::OnceLock};

/// `allow.json` of `@pnpm/plugin-trusted-deps` 0.2.2, the version Bit depends
/// on: OSS packages known to need their lifecycle scripts. Copied verbatim;
/// refresh it together with that dependency.
const TRUSTED_DEPS_JSON: &str = include_str!("trusted_deps.json");

/// Packages with risky or unnecessary build scripts, disallowed unless the
/// user explicitly allows them (the same list as `lynx.ts`).
const UNTRUSTED_PACKAGE_NAMES: [&str; 6] =
    ["es5-ext", "less", "protobufjs", "ssh", "core-js-pure", "core-js"];

/// The engine's build policy.
#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub struct ScriptPolicy {
    /// `allowBuilds`: `name -> allowed`.
    pub allow_builds: BTreeMap<String, bool>,
    /// `dangerouslyAllowAllBuilds`.
    pub dangerously_allow_all_builds: Option<bool>,
    /// `neverBuiltDependencies` under `dangerouslyAllowAllScripts`: their
    /// `scripts` are removed from their manifests.
    pub never_build_package_names: Vec<String>,
}

/// The trusted package names.
pub(super) fn trusted_package_names() -> &'static [String] {
    static NAMES: OnceLock<Vec<String>> = OnceLock::new();
    NAMES.get_or_init(|| serde_json::from_str(TRUSTED_DEPS_JSON).unwrap_or_default())
}

/// `getAllowedScripts`: the configured `allowScripts`, with the JSON object in
/// `BIT_ALLOW_SCRIPTS` (not persisted) layered on top.
pub(super) fn allowed_scripts(
    config: &DependencyResolverConfig,
    from_env: Option<&str>,
) -> io::Result<Option<IndexMap<String, Value>>> {
    let Some(from_env) = from_env
        .map(str::trim)
        .filter(|value| !value.is_empty())
    else {
        return Ok(config.allow_scripts.clone());
    };
    let parsed: Value = serde_json::from_str(from_env)
        .map_err(|_| {
            io::Error::other(
                "Failed to parse the JSON object in the BIT_ALLOW_SCRIPTS environment variable",
            )
        })?;
    let Value::Object(from_env) = parsed else {
        return Err(io::Error::other("BIT_ALLOW_SCRIPTS must be a JSON object"));
    };
    let mut merged = config.allow_scripts.clone().unwrap_or_default();
    merged.extend(
        from_env
            .into_iter()
            .map(|(name, value)| (name.trim().to_string(), value))
            .filter(|(name, _)| !name.is_empty()),
    );
    Ok(Some(merged))
}

/// `resolveScriptPolicies`.
pub(super) fn resolve(
    allow_scripts: Option<&IndexMap<String, Value>>,
    dangerously_allow_all_scripts: bool,
    never_built: &[String],
) -> ScriptPolicy {
    if dangerously_allow_all_scripts {
        return allow_all_but(never_built);
    }
    let mut allow_builds = configured_builds(allow_scripts);
    let configured = |name: &str| allow_scripts.and_then(|scripts| scripts.get(name));
    for name in trusted_package_names() {
        if configured(name).is_none_or(Value::is_null) {
            allow_builds.insert(name.clone(), true);
        }
    }
    for name in UNTRUSTED_PACKAGE_NAMES {
        if configured(name) != Some(&Value::Bool(true)) {
            allow_builds.insert(name.to_string(), false);
        }
    }
    allow_builds.extend(
        never_built
            .iter()
            .map(|name| (name.clone(), false)),
    );
    ScriptPolicy { allow_builds, ..ScriptPolicy::default() }
}

/// `dangerouslyAllowAllScripts`: everything builds, except the never-built
/// dependencies, whose scripts are also removed from their manifests.
fn allow_all_but(never_built: &[String]) -> ScriptPolicy {
    if never_built.is_empty() {
        return ScriptPolicy {
            dangerously_allow_all_builds: Some(true),
            ..ScriptPolicy::default()
        };
    }
    ScriptPolicy {
        allow_builds: never_built
            .iter()
            .map(|name| (name.clone(), false))
            .collect(),
        dangerously_allow_all_builds: None,
        never_build_package_names: never_built.to_vec(),
    }
}

/// The boolean `allowScripts` entries. String values (e.g. `warn`) are
/// placeholders that pnpm warns about.
fn configured_builds(allow_scripts: Option<&IndexMap<String, Value>>) -> BTreeMap<String, bool> {
    allow_scripts
        .into_iter()
        .flatten()
        .filter_map(|(name, allowed)| {
            allowed
                .as_bool()
                .map(|allowed| (name.clone(), allowed))
        })
        .collect()
}
