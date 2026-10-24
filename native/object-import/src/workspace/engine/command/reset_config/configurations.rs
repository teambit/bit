use super::{Value, invalid};
use std::io;

pub(super) fn plain(name: &str, value: &Value) -> io::Result<Value> {
    let mut config = value
        .as_object()
        .cloned()
        .ok_or_else(|| invalid("reset aspect config"))?;
    config.remove("__specific");
    match name {
        "teambit.dependencies/dependency-resolver" => {
            if config.keys().any(|key| key != "policy") {
                return Err(invalid("reset resolver config"));
            }
            if let Some(policy) = config.get("policy") {
                validate_policy(policy)?;
            }
        }
        "teambit.envs/envs" => {
            validate_single(&config, "env", |value| value == "teambit.harmony/node")?;
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

fn validate_policy(value: &Value) -> io::Result<()> {
    let policy = value.as_object().ok_or_else(|| invalid("reset dependency policy"))?;
    for (lifecycle, dependencies) in policy {
        if !matches!(lifecycle.as_str(), "dependencies" | "devDependencies" | "peerDependencies") {
            return Err(invalid("reset policy lifecycle"));
        }
        let dependencies = dependencies.as_object().ok_or_else(|| invalid("reset policy map"))?;
        if dependencies
            .values()
            .any(|version| version.as_str().is_none_or(str::is_empty))
        {
            return Err(invalid("reset policy version"));
        }
    }
    Ok(())
}
