use super::{Input, Map, Value, invalid, value};
use std::io;

/// `NodeModuleLinker.createPackageJson` for an unlinked component using the default Node env.
pub(super) fn manifest(input: &Input<'_>, package_name: &str, snapshot: bool) -> io::Result<Value> {
    let (scope, name) = parse_package_identity(input.identity)?;
    let main_file = input.version["mainFile"]
        .as_str()
        .map(str::trim)
        .filter(|file| !file.is_empty())
        .ok_or_else(|| invalid("tag package main file"))?;
    let (main, types) = if snapshot {
        package_paths(input.version, main_file).unwrap_or_else(|_| (main_file.to_owned(), None))
    } else {
        validate_default_env(input.version)?;
        package_paths(input.version, main_file)?
    };
    let (version, component_version) = package_versions(input);
    let package_name = package_name.trim();
    let mut fields = Map::new();
    fields.insert("name".into(), value!(package_name));
    fields.insert("version".into(), value!(version));
    fields.insert("main".into(), value!(main));
    fields.insert(
        "componentId".into(),
        value!({"name":name,"version":component_version,"scope":scope}),
    );
    insert_dependency_fields(&mut fields, input.version);
    fields.insert("license".into(), value!("SEE LICENSE IN UNLICENSED"));
    fields.insert("exported".into(), value!(false));
    fields.insert("optionalDependencies".into(), Value::Object(Map::new()));
    fields.insert("peerDependenciesMeta".into(), Value::Object(Map::new()));
    if let Some(bit) = peer_bit_metadata(input.version) {
        fields.insert("bit".into(), bit);
    }
    if let Some(types) = types {
        fields.insert("types".into(), value!(types));
    }
    fields.insert("_bit_local".into(), value!(true));
    fields.insert("source".into(), value!(main_file));
    Ok(Value::Object(fields))
}

fn package_versions<'a>(input: &'a Input<'_>) -> (String, &'a str) {
    let hash = input.hash.trim();
    let semantic = input.semantic_version
        .map(str::trim)
        .filter(|ver| !ver.is_empty());
    let version = semantic.map_or_else(|| format!("0.0.0-{hash}"), str::to_owned);
    (version, semantic.unwrap_or(hash))
}

fn parse_package_identity(identity: &str) -> io::Result<(&str, &str)> {
    identity
        .trim()
        .split_once('/')
        .map(|(scope, name)| (scope.trim(), name.trim()))
        .filter(|(scope, name)| !scope.is_empty() && !name.is_empty())
        .ok_or_else(|| invalid("tag package identity"))
}

fn insert_dependency_fields(fields: &mut Map<String, Value>, version: &Value) {
    for (target, source) in [
        ("dependencies", "packageDependencies"),
        ("devDependencies", "devPackageDependencies"),
        ("peerDependencies", "peerPackageDependencies"),
    ] {
        fields.insert(target.into(), version[source].clone());
    }
}

fn matches_aspect(row: &Value, id: &str) -> bool {
    crate::workspace::engine::client_status::config::is_extension_aspect(row, id)
}

fn peer_bit_metadata(version: &Value) -> Option<Value> {
    let config = version["extensions"]
        .as_array()?
        .iter()
        .find(|row| matches_aspect(row, "teambit.dependencies/dependency-resolver"))?
        .get("config")?;
    if !truthy(config.get("peer")) {
        return None;
    }
    let mut bit = Map::new();
    bit.insert("peer".into(), value!(true));
    if let Some(range) = config
        .get("defaultPeerRange")
        .filter(|range| truthy(Some(range)))
    {
        bit.insert("defaultPeerRange".into(), range.clone());
    }
    Some(Value::Object(bit))
}

fn truthy(value: Option<&Value>) -> bool {
    match value {
        None | Some(Value::Null) => false,
        Some(Value::Bool(flag)) => *flag,
        Some(Value::Number(number)) => number
            .as_f64()
            .is_some_and(|number| number != 0.0),
        Some(Value::String(text)) => !text.trim().is_empty(),
        Some(_) => true,
    }
}

fn validate_default_env(version: &Value) -> io::Result<()> {
    let env = version["extensions"]
        .as_array()
        .and_then(|rows| rows.iter().find(|row| matches_aspect(row, "teambit.envs/envs")));
    let props = &version["packageJsonChangedProps"];
    let unchanged = props.is_null() || props.as_object().is_some_and(Map::is_empty);
    let optional = version["extensions"]
        .as_array()
        .into_iter()
        .flatten()
        .filter(|row| matches_aspect(row, "teambit.dependencies/dependency-resolver"))
        .flat_map(|row| {
            row["data"]["dependencies"]
                .as_array()
                .into_iter()
                .flatten()
        })
        .any(|dependency| dependency["optional"] == true);
    if env.is_none_or(|env| {
        env["data"]["id"]
            .as_str()
            .map(str::trim)
            .is_none_or(|id| {
                id != "teambit.harmony/node" && !id.starts_with("teambit.harmony/node@")
            })
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
        .and_then(|rows| rows.iter().find(|row| matches_aspect(row, "teambit.pkg/pkg")));
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
        .map(str::trim)
        .filter(|main| !main.is_empty())
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
        .map(str::trim)
        .filter(|types| !types.is_empty())
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
