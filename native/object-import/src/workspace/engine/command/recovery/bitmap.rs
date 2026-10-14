use super::super::invalid;
use serde_json::Value;
use std::{collections::HashMap, io};

pub(super) fn project(bitmap: &Value) -> io::Result<(Value, HashMap<String, Value>)> {
    let mut projected = bitmap.clone();
    let mut configs = HashMap::new();
    for (key, row) in projected.as_object_mut().ok_or_else(|| invalid("recovery bitmap"))? {
        if matches!(key.as_str(), "$schema-version" | "_bit_lane") {
            continue;
        }
        let object = row.as_object_mut().ok_or_else(|| invalid("recovery bitmap component"))?;
        let Some(config) = object.remove("config") else {
            continue;
        };
        validate(&config)?;
        let directory = object
            .get("rootDir")
            .and_then(Value::as_str)
            .ok_or_else(|| invalid("recovery bitmap directory"))?;
        if configs.insert(directory.to_owned(), config).is_some() {
            return Err(invalid("recovery duplicate config root"));
        }
    }
    Ok((projected, configs))
}
fn validate(config: &Value) -> io::Result<()> {
    let rows = config.as_object().ok_or_else(|| invalid("recovery bitmap configuration"))?;
    for (name, value) in rows {
        if !matches!(
            name.as_str(),
            "teambit.dependencies/dependency-resolver"
                | "teambit.envs/envs"
                | "teambit.component/dev-files"
                | "teambit.semantics/schema"
                | "teambit.pkg/pkg"
                | "teambit.preview/preview"
                | "teambit.compositions/compositions"
                | "teambit.docs/docs"
                | "teambit.pipelines/builder"
                | "teambit.component/deprecation",
        ) || !value.is_object()
        {
            return Err(invalid("recovery bitmap custom configuration"));
        }
        // Effective policy is consumed by the recovery status adapter. Nonempty
        // custom provider configuration remains outside this command boundary.
        if value
            .as_object()
            .unwrap()
            .keys()
            .any(|key| name != "teambit.dependencies/dependency-resolver" || key != "policy")
        {
            return Err(invalid("recovery bitmap provider configuration"));
        }
    }
    Ok(())
}
#[cfg(test)]
mod tests;
