use super::{Input, Prepared, invalid, json, pretty, proof};
use serde_json::{Value, json as value};
use std::{fs, io, path::Path};

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
    output: &mut Prepared,
) -> io::Result<()> {
    let name = package_name(input.version)?;
    let directory = root.join("node_modules").join(name);
    ordinary(root, &directory, output)?;
    manifest(input, name, &directory, output)?;
    for file in input.version["files"].as_array().ok_or_else(|| invalid("merge package files"))? {
        let relative =
            file["relativePath"].as_str().ok_or_else(|| invalid("merge package filename"))?;
        crate::checkout::plan::relative_path(relative)?;
        if relative == "package.json" {
            return Err(invalid("merge tracked package manifest"));
        }
        link(root, &root.join(input.directory).join(relative), &directory.join(relative), output)?;
        if roots {
            root_copies(root, name, relative, &root.join(input.directory).join(relative), output)?;
        }
    }
    Ok(())
}
fn package_name(version: &Value) -> io::Result<&str> {
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
    let roots = root.join("node_modules/.bit_roots");
    ordinary(root, &roots, output)?;
    let entries = fs::read_dir(&roots)?.collect::<Result<Vec<_>, _>>()?;
    if entries.len() > 4096 {
        return Err(invalid("merge env root count"));
    }
    for entry in entries {
        if entry.file_name().to_str() != Some("teambit.harmony_node") {
            return Err(invalid("merge custom env root"));
        }
        let package = entry
            .path()
            .join("node_modules")
            .join(name);
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
    output: &mut Prepared,
) -> io::Result<()> {
    let manifest = directory.join("package.json");
    let bytes = proof::read(&manifest, &mut output.proofs)?
        .ok_or_else(|| invalid("merge generated package missing"))?;
    let mut package = json(&bytes)?;
    validate_package(input, &package, name)?;
    for (field, version_field) in [
        ("dependencies", "packageDependencies"),
        ("devDependencies", "devPackageDependencies"),
        ("peerDependencies", "peerPackageDependencies"),
    ] {
        package[field] = input.version[version_field].clone();
    }
    let version = format!("0.0.0-{}", input.hash);
    package["version"] = value!(version);
    package["componentId"]["version"] = value!(input.hash);
    output.writes.push((manifest, pretty(&package, true)?));
    Ok(())
}
