use super::{Input, Prepared, invalid, json, pretty, proof};
use serde_json::{Map, Value, json as value};
use std::{
    fs, io,
    path::{Path, PathBuf},
};

const PACKAGE_FIELDS: &[&str] = &[
    "name",
    "version",
    "homepage",
    "main",
    "componentId",
    "dependencies",
    "devDependencies",
    "peerDependencies",
    "license",
    "exported",
    "optionalDependencies",
    "peerDependenciesMeta",
    "types",
    "_bit_local",
    "source",
];

pub(super) fn prepare(
    root: &Path,
    input: &Input<'_>,
    roots: bool,
    allow_missing: bool,
    output: &mut Prepared,
) -> io::Result<()> {
    let name = package_name(input.version)?;
    let directory = root.join("node_modules").join(name);
    ordinary(root, &directory, output)?;
    let created = manifest(input, name, &directory, allow_missing, output)?;
    for file in input.version["files"].as_array().ok_or_else(|| invalid("merge package files"))? {
        let relative =
            file["relativePath"].as_str().ok_or_else(|| invalid("merge package filename"))?;
        crate::checkout::plan::relative_path(relative)?;
        if relative == "package.json" {
            return Err(invalid("merge tracked package manifest"));
        }
        link(root, &root.join(input.directory).join(relative), &directory.join(relative), output)?;
        if roots && !created {
            root_copies(root, name, relative, &root.join(input.directory).join(relative), output)?;
        }
    }
    Ok(())
}
pub(super) fn package_name(version: &Value) -> io::Result<&str> {
    let name = version["extensions"]
        .as_array()
        .and_then(|rows| {
            rows.iter()
                .find(|row| row["name"] == "teambit.dependencies/dependency-resolver")
        })
        .and_then(|row| row["data"]["packageName"].as_str())
        .ok_or_else(|| invalid("merge package name"))?;
    crate::checkout::plan::relative_path(name)?;
    if !name.starts_with('@') || name.matches('/').count() != 1 {
        return Err(invalid("merge scoped package required"));
    }
    Ok(name)
}
fn validate_package(input: &Input<'_>, package: &Value, name: &str) -> io::Result<()> {
    let (scope, component) =
        input.identity.split_once('/').ok_or_else(|| invalid("merge package identity"))?;
    if package["name"] != name
        || package["_bit_local"] != true
        || package["componentId"]["scope"] != scope
        || package["componentId"]["name"] != component
    {
        return Err(invalid("merge generated package identity"));
    }
    if package
        .as_object()
        .is_none_or(|object| {
            object
                .keys()
                .any(|key| !PACKAGE_FIELDS.contains(&key.as_str()))
        })
    {
        return Err(invalid("merge custom package metadata"));
    }
    for field in ["optionalDependencies", "peerDependenciesMeta"] {
        if package
            .get(field)
            .is_some_and(|value| !value.as_object().is_some_and(serde_json::Map::is_empty))
        {
            return Err(invalid("merge optional generated package policy"));
        }
    }
    Ok(())
}
fn link(root: &Path, source: &Path, destination: &Path, output: &mut Prepared) -> io::Result<()> {
    ordinary(root, destination.parent().ok_or_else(|| invalid("merge link parent"))?, output)?;
    match fs::symlink_metadata(destination) {
        Ok(metadata) if metadata.is_symlink() => {
            output.proofs.push(proof::metadata(destination, Some(&fs::metadata(destination)?))?);
        }
        Err(error) if error.kind() == io::ErrorKind::NotFound => {
            proof::read(destination, &mut output.proofs)?;
            output.links.push((source.to_path_buf(), destination.to_path_buf()));
        }
        Err(error) => return Err(error),
        _ => return Err(invalid("merge existing nonsymlink source link")),
    }
    Ok(())
}
fn root_copies(
    root: &Path,
    name: &str,
    relative: &str,
    source: &Path,
    output: &mut Prepared,
) -> io::Result<()> {
    for entry in root_entries(root, output)? {
        if entry.file_name().to_str() != Some("teambit.harmony_node") {
            return Err(invalid("merge custom env root"));
        }
        let package = injected(
            root,
            &entry
                .path()
                .join("node_modules")
                .join(name),
            output,
        )?;
        if proof::read(&package.join("package.json"), &mut output.proofs)?.is_none() {
            return Err(invalid("merge env package missing"));
        }
        let destination = package.join(relative);
        ordinary(
            root,
            destination.parent().ok_or_else(|| invalid("merge root link parent"))?,
            output,
        )?;
        match fs::symlink_metadata(&destination) {
            Ok(metadata) if metadata.is_file() => {
                output.proofs.push(proof::metadata(&destination, Some(&metadata))?);
            }
            Err(error) if error.kind() == io::ErrorKind::NotFound => {
                proof::read(&destination, &mut output.proofs)?;
                output.copies.push((source.to_path_buf(), destination));
            }
            Err(error) => return Err(error),
            _ => return Err(invalid("merge root package layout")),
        }
    }
    Ok(())
}

fn root_entries(root: &Path, output: &mut Prepared) -> io::Result<Vec<fs::DirEntry>> {
    let roots = root.join("node_modules/.bit_roots");
    ordinary(root, &roots, output)?;
    let entries = match fs::read_dir(&roots) {
        Ok(entries) => entries.collect::<Result<Vec<_>, _>>()?,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(error) => return Err(error),
    };
    if entries.len() > 4096 {
        return Err(invalid("merge env root count"));
    }
    Ok(entries)
}
/// An env root's component package: `bit install` links it to the
/// injected copy in the pnpm store, which is written through the link.
pub(super) fn injected(root: &Path, package: &Path, output: &mut Prepared) -> io::Result<PathBuf> {
    match fs::symlink_metadata(package) {
        Ok(metadata) if metadata.is_symlink() => {
            let store = root.join("node_modules/.pnpm");
            let real = fs::canonicalize(package)?;
            let relative = real
                .strip_prefix(fs::canonicalize(&store)?)
                .map_err(|_| invalid("merge env package outside the store"))?;
            output.proofs.push(proof::metadata(package, Some(&fs::metadata(package)?))?);
            Ok(store.join(relative))
        }
        _ => Ok(package.to_path_buf()),
    }
}
fn ordinary(root: &Path, path: &Path, output: &mut Prepared) -> io::Result<()> {
    let relative = path.strip_prefix(root).map_err(io::Error::other)?;
    let mut directory = root.to_path_buf();
    for part in relative.components() {
        directory.push(part);
        match fs::symlink_metadata(&directory) {
            Ok(metadata) if metadata.is_dir() => {
                output.proofs.push(proof::metadata(&directory, Some(&metadata))?);
            }
            Err(error) if error.kind() == io::ErrorKind::NotFound => {
                output.proofs.push(proof::metadata(&directory, None)?);
            }
            Err(error) => return Err(error),
            _ => return Err(invalid("merge package ancestor type")),
        }
    }
    Ok(())
}

fn manifest(
    input: &Input<'_>,
    name: &str,
    directory: &Path,
    allow_missing: bool,
    output: &mut Prepared,
) -> io::Result<bool> {
    let manifest = directory.join("package.json");
    let previous = proof::read(&manifest, &mut output.proofs)?;
    let created = previous.is_none();
    let mut package = match previous {
        Some(bytes) => json(&bytes)?,
        None if allow_missing => {
            output.package_creates.push(manifest.clone());
            generated(input, name)?
        }
        None => return Err(invalid("merge generated package missing")),
    };
    validate_package(input, &package, name)?;
    for (field, version_field) in [
        ("dependencies", "packageDependencies"),
        ("devDependencies", "devPackageDependencies"),
        ("peerDependencies", "peerPackageDependencies"),
    ] {
        package[field] = input.version[version_field].clone();
    }
    let component_version = input.semantic_version.unwrap_or(input.hash);
    let version =
        input.semantic_version.map_or_else(|| format!("0.0.0-{}", input.hash), str::to_owned);
    package["version"] = value!(version);
    if package["componentId"].get("version").is_none() {
        let component = &package["componentId"];
        package["componentId"] = value!({"name":component["name"],"version":component_version,"scope":component["scope"]});
    } else {
        package["componentId"]["version"] = value!(component_version);
    }
    output.writes.push((manifest, pretty(&package, true)?));
    Ok(created)
}

/// `NodeModuleLinker.createPackageJson` for an unlinked component using the default Node env.
fn generated(input: &Input<'_>, package_name: &str) -> io::Result<Value> {
    let (scope, name) =
        input.identity.split_once('/').ok_or_else(|| invalid("tag package identity"))?;
    let main_file =
        input.version["mainFile"].as_str().ok_or_else(|| invalid("tag package main file"))?;
    validate_default_env(input.version)?;
    let (main, types) = package_paths(input.version, main_file)?;
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
