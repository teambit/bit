//! Core aspect configuration schema validation via [`plain`] for `component.json` reset writes.

use super::{Value, invalid};
use std::io;

/// Validates and strips `__specific` from core aspect configuration `value` ([`Value`]) for `name` via [`validate_single`] and [`validate_policy`].
pub(super) fn plain(name: &str, value: &Value) -> io::Result<Value> {
    let source = value.as_object().ok_or_else(|| invalid("reset aspect config"))?;
    let mut config = source.clone();
    config.remove("__specific");
    let name = name.trim();
    match name
        .split('@')
        .next()
        .map_or(name, str::trim)
    {
        "teambit.dependencies/dependency-resolver" => {
            if config.keys().any(|key| key != "policy") {
                return Err(invalid("reset resolver config"));
            }
            if let Some(policy) = config.get("policy") {
                validate_policy(policy)?;
            }
        }
        "teambit.envs/envs" => {
            validate_single(&config, "env", is_harmony_node_env)?;
        }
        "teambit.component/deprecation" => {
            validate_single(&config, "deprecate", Value::is_boolean)?;
        }
        "teambit.component/dev-files"
        | "teambit.semantics/schema"
        | "teambit.pkg/pkg"
        | "teambit.preview/preview"
        | "teambit.compositions/compositions"
        | "teambit.docs/docs"
        | "teambit.pipelines/builder" => {
            if !config.is_empty() {
                return Err(invalid("reset callback configuration"));
            }
        }
        _ => return Err(invalid("reset custom configuration")),
    }
    Ok(Value::Object(config))
}

/// Validates that `config` contains at most `key` and that its value satisfies `valid` for [`plain`].
#[inline]
fn validate_single(
    config: &serde_json::Map<String, Value>,
    key: &str,
    valid: impl Fn(&Value) -> bool,
) -> io::Result<()> {
    if config.keys().any(|name| name != key)
        || config
            .get(key)
            .is_some_and(|value| !valid(value))
    {
        return Err(invalid("reset configured core aspect"));
    }
    Ok(())
}

/// Validates that `value` is a dependency-resolver `policy` object with non-empty version strings.
#[inline]
fn validate_policy(value: &Value) -> io::Result<()> {
    let policy = value.as_object().ok_or_else(|| invalid("reset dependency policy"))?;
    for (lifecycle, dependencies) in policy {
        if !matches!(lifecycle.as_str(), "dependencies" | "devDependencies" | "peerDependencies") {
            return Err(invalid("reset policy lifecycle"));
        }
        let dependencies = dependencies.as_object().ok_or_else(|| invalid("reset policy map"))?;
        if dependencies
            .iter()
            .any(|(name, version)| {
                name.trim().is_empty()
                    || version
                        .as_str()
                        .map(str::trim)
                        .is_none_or(str::is_empty)
            })
        {
            return Err(invalid("reset policy version"));
        }
    }
    Ok(())
}

/// Returns `true` when `value` is a `teambit.harmony/node` environment ID with a non-empty version.
#[inline]
fn is_harmony_node_env(value: &Value) -> bool {
    value
        .as_str()
        .is_some_and(|env| {
            let env = env.trim();
            let (base, version) = env
                .rsplit_once('@')
                .unwrap_or((env, "latest"));
            base.trim() == "teambit.harmony/node" && !version.trim().is_empty()
        })
}
