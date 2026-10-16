use super::{Input, Map, Value, invalid, value};
use std::io;

/// `NodeModuleLinker.createPackageJson` for an unlinked component using the default Node env.
pub(super) fn manifest(input: &Input<'_>, package_name: &str, snapshot: bool) -> io::Result<Value> {
    let (scope, name) =
        input.identity.split_once('/').ok_or_else(|| invalid("tag package identity"))?;
    let main_file =
        input.version["mainFile"].as_str().ok_or_else(|| invalid("tag package main file"))?;
    let (main, types) = if snapshot {
        package_paths(input.version, main_file).unwrap_or_else(|_| (main_file.to_owned(), None))
    } else {
        validate_default_env(input.version)?;
        package_paths(input.version, main_file)?
    };
    let version =
        input.semantic_version.map_or_else(|| format!("0.0.0-{}", input.hash), str::to_owned);
    let component_version = input.semantic_version.unwrap_or(input.hash);
    let mut fields = Map::new();
    fields.insert("name".into(), value!(package_name));
    fields.insert("version".into(), value!(version));
    fields.insert("main".into(), value!(main));
    fields.insert(
        "componentId".into(),
        value!({"name":name,"version":component_version,"scope":scope}),
    );
    for (target, source) in [
        ("dependencies", "packageDependencies"),
        ("devDependencies", "devPackageDependencies"),
        ("peerDependencies", "peerPackageDependencies"),
    ] {
        fields.insert(target.into(), input.version[source].clone());
    }
    fields.insert("license".into(), value!("SEE LICENSE IN UNLICENSED"));
    fields.insert("exported".into(), value!(false));
    fields.insert("optionalDependencies".into(), Value::Object(Map::new()));
    fields.insert("peerDependenciesMeta".into(), Value::Object(Map::new()));
    if let Some(types) = types {
        fields.insert("types".into(), value!(types));
    }
    fields.insert("_bit_local".into(), value!(true));
    fields.insert("source".into(), value!(main_file));
    Ok(Value::Object(fields))
}

fn validate_default_env(version: &Value) -> io::Result<()> {
    let env = version["extensions"]
        .as_array()
        .and_then(|rows| {
            rows.iter()
                .find(|row| row["name"] == "teambit.envs/envs")
        });
    let props = &version["packageJsonChangedProps"];
    let unchanged = props.is_null() || props.as_object().is_some_and(Map::is_empty);
    let optional = version["extensions"]
        .as_array()
        .into_iter()
        .flatten()
        .filter(|row| row["name"] == "teambit.dependencies/dependency-resolver")
        .flat_map(|row| {
            row["data"]["dependencies"]
                .as_array()
                .into_iter()
                .flatten()
        })
        .any(|dependency| dependency["optional"] == true);
    if env.is_none_or(|env| {
        env["data"]["id"] != "teambit.harmony/node"
            || !env["config"].as_object().is_some_and(Map::is_empty)
    }) || !unchanged
        || optional
    {
        return Err(invalid("tag package requires canonical linker"));
    }
    Ok(())
}

fn package_paths(version: &Value, main_file: &str) -> io::Result<(String, Option<String>)> {
    let pkg = version["extensions"]
        .as_array()
        .and_then(|rows| {
            rows.iter()
                .find(|row| row["name"] == "teambit.pkg/pkg")
        });
    let changes = pkg
        .filter(|pkg| pkg["config"].as_object().is_some_and(Map::is_empty))
        .map(|pkg| &pkg["data"]["packageJsonModification"]);
    let Some(changes) = changes.and_then(Value::as_object) else {
        return Err(invalid("tag package props"));
    };
    if changes
        .keys()
        .any(|key| !matches!(key.as_str(), "main" | "types"))
    {
        return Err(invalid("tag package custom props"));
    }
    let stem = main_file.rsplit_once('.').map_or(main_file, |(stem, _)| stem);
    let replace = |text: &str| text.replace("{main}", stem);
    let main = changes
        .get("main")
        .and_then(Value::as_str)
        .ok_or_else(|| invalid("tag package main"))?;
    if changes
        .get("types")
        .is_some_and(|value| !value.is_string())
    {
        return Err(invalid("tag package types"));
    }
    let types = changes
        .get("types")
        .and_then(Value::as_str)
        .map(replace);
    let main = replace(main);
    validate_generated_paths(&main, types.as_deref())?;
    Ok((main, types))
}

fn validate_generated_paths(main: &str, types: Option<&str>) -> io::Result<()> {
    for path in std::iter::once(main).chain(types) {
        if path.contains(['{', '}']) {
            return Err(invalid("tag package placeholder"));
        }
        crate::checkout::plan::relative_path(path)?;
    }
    Ok(())
}
