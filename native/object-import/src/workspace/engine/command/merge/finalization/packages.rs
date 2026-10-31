mod generated;

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
    snapshot: bool,
    output: &mut Prepared,
) -> io::Result<()> {
    let name = package_name(input.version)?;
    let directory = root.join("node_modules").join(name);
    ordinary(root, &directory, output)?;
    let tracked = snapshot && tracked_manifest(input.version);
    let created = if tracked {
        false
    } else {
        manifest(root, input, name, &directory, allow_missing, snapshot, output)?
    };
    for file in input.version["files"].as_array().ok_or_else(|| invalid("merge package files"))? {
        let relative =
            file["relativePath"].as_str().ok_or_else(|| invalid("merge package filename"))?;
        crate::checkout::plan::relative_path(relative)?;
        if relative == "package.json" && !tracked {
            return Err(invalid("merge tracked package manifest"));
        }
        link(
            root,
            &root.join(input.directory).join(relative),
            &directory.join(relative),
            snapshot,
            output,
        )?;
        if roots && !created {
            root_copies(
                root,
                name,
                relative,
                &root.join(input.directory).join(relative),
                snapshot,
                output,
            )?;
        }
    }
    windows_source_link(root, input, &directory, snapshot, output)?;
    Ok(())
}
pub(super) fn package_name(version: &Value) -> io::Result<&str> {
    let name = version["extensions"]
        .as_array()
        .and_then(|rows| {
            rows.iter()
                .find(|row| {
                    crate::workspace::engine::client_status::config::is_extension_aspect(
                        row,
                        "teambit.dependencies/dependency-resolver",
                    )
                })
        })
        .and_then(|row| row["data"]["packageName"].as_str())
        .ok_or_else(|| invalid("merge package name"))?;
    crate::checkout::plan::relative_path(name)?;
    if !name.starts_with('@') || name.matches('/').count() != 1 {
        return Err(invalid("merge scoped package required"));
    }
    Ok(name)
}
fn package_id_matches(component_id: &Value, identity: &str, scope: &str, component: &str) -> bool {
    if let Some(raw) = component_id.as_str() {
        raw.rsplit_once('@').map_or(raw, |(bare, _)| bare) == identity
    } else {
        component_id["scope"] == scope && component_id["name"] == component
    }
}
fn validate_package(
    input: &Input<'_>,
    package: &Value,
    name: &str,
    snapshot: bool,
) -> io::Result<()> {
    let (scope, component) =
        input.identity.split_once('/').ok_or_else(|| invalid("merge package identity"))?;
    if package["name"] != name
        || package["_bit_local"] != true
        || !package_id_matches(&package["componentId"], input.identity, scope, component)
    {
        return Err(invalid("merge generated package identity"));
    }
    if !snapshot
        && package
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
        if !snapshot
            && package
                .get(field)
                .is_some_and(|value| !value.as_object().is_some_and(serde_json::Map::is_empty))
        {
            return Err(invalid("merge optional generated package policy"));
        }
    }
    Ok(())
}
fn link(
    root: &Path,
    source: &Path,
    destination: &Path,
    snapshot: bool,
    output: &mut Prepared,
) -> io::Result<()> {
    ordinary(root, destination.parent().ok_or_else(|| invalid("merge link parent"))?, output)?;
    match fs::symlink_metadata(destination) {
        Ok(metadata) if metadata.is_symlink() => {
            output.proofs.push(if snapshot {
                proof::symlink(destination)?
            } else {
                proof::metadata(destination, Some(&fs::metadata(destination)?))?
            });
        }
        Err(error) if error.kind() == io::ErrorKind::NotFound => {
            proof::read(destination, &mut output.proofs)?;
            output.links.push((source.to_path_buf(), destination.to_path_buf()));
        }
        Err(error) => return Err(error),
        Ok(metadata)
            if snapshot && (metadata.is_file() || (cfg!(windows) && metadata.is_dir())) =>
        {
            output.proofs.push(proof::metadata(destination, Some(&metadata))?);
            #[cfg(unix)]
            output.links.push((source.to_path_buf(), destination.to_path_buf()));
            #[cfg(windows)]
            if !same_file::is_same_file(source, destination)? {
                output.links.push((source.to_path_buf(), destination.to_path_buf()));
            }
        }
        _ => return Err(invalid("merge existing nonsymlink source link")),
    }
    Ok(())
}
fn root_copies(
    root: &Path,
    name: &str,
    relative: &str,
    source: &Path,
    snapshot: bool,
    output: &mut Prepared,
) -> io::Result<()> {
    for entry in root_entries(root, snapshot, output)? {
        if !snapshot && entry.file_name().to_str() != Some("teambit.harmony_node") {
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

fn root_entries(
    root: &Path,
    snapshot: bool,
    output: &mut Prepared,
) -> io::Result<Vec<fs::DirEntry>> {
    let roots = roots_path(root, snapshot, output)?;
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
    root: &Path,
    input: &Input<'_>,
    name: &str,
    directory: &Path,
    allow_missing: bool,
    snapshot: bool,
    output: &mut Prepared,
) -> io::Result<bool> {
    let manifest = directory.join("package.json");
    let previous = proof::read(&manifest, &mut output.proofs)?;
    let created = previous.is_none();
    if created {
        output.package_creates.push(manifest.clone());
    }
    let mut package = if snapshot {
        let mut package = generated::manifest(input, name, true)?;
        let exported = exported(root, input.directory, output)?;
        package["exported"] = value!(exported);
        package
    } else {
        match previous {
            Some(bytes) => json(&bytes)?,
            None if allow_missing => generated::manifest(input, name, false)?,
            None => return Err(invalid("merge generated package missing")),
        }
    };
    validate_package(input, &package, name, snapshot)?;
    update_manifest_versions(input, &mut package, snapshot)?;
    output.writes.push((manifest, pretty(&package, true)?));
    Ok(created)
}

fn roots_path(root: &Path, snapshot: bool, output: &mut Prepared) -> io::Result<PathBuf> {
    if !snapshot {
        return Ok(root.join("node_modules/.bit_roots"));
    }
    let bytes = proof::read(&root.join("workspace.jsonc"), &mut output.proofs)?;
    let config = bytes.map(|bytes| crate::recovery::jsonc::parse(&bytes)).transpose()?;
    let base = config
        .as_ref()
        .and_then(|config| {
            crate::component_tracking::identity::workspace_aspect(config)["rootComponentsDirectory"]
                .as_str()
        })
        .unwrap_or("node_modules");
    crate::checkout::plan::relative_path(base)?;
    Ok(root.join(base).join(".bit_roots"))
}

fn windows_source_link(
    root: &Path,
    input: &Input<'_>,
    directory: &Path,
    snapshot: bool,
    output: &mut Prepared,
) -> io::Result<()> {
    if snapshot && cfg!(windows) {
        link(root, &root.join(input.directory), &directory.join("_src"), true, output)?;
    }
    Ok(())
}

fn exported(root: &Path, directory: &str, output: &mut Prepared) -> io::Result<bool> {
    let bytes = proof::read(&root.join(".bitmap"), &mut output.proofs)?
        .ok_or_else(|| invalid("snapshot package bitmap missing"))?;
    let bitmap = crate::recovery::jsonc::parse(&bytes)?;
    let entry = bitmap
        .as_object()
        .and_then(|entries| {
            entries
                .values()
                .find(|entry| entry["rootDir"] == directory)
        })
        .ok_or_else(|| invalid("snapshot package bitmap entry"))?;
    Ok(entry["scope"]
        .as_str()
        .is_some_and(|scope| !scope.is_empty()))
}

fn update_manifest_versions(
    input: &Input<'_>,
    package: &mut Value,
    snapshot: bool,
) -> io::Result<()> {
    for (field, version_field) in [
        ("dependencies", "packageDependencies"),
        ("devDependencies", "devPackageDependencies"),
        ("peerDependencies", "peerPackageDependencies"),
    ] {
        package[field] = input.version[version_field].clone();
    }
    if snapshot && cfg!(windows) {
        let main =
            input.version["mainFile"].as_str().ok_or_else(|| invalid("snapshot package main"))?;
        let types = format!("_src/{main}");
        package["types"] = value!(types);
    }
    let component_version = input.semantic_version.unwrap_or(input.hash);
    let version =
        input.semantic_version.map_or_else(|| format!("0.0.0-{}", input.hash), str::to_owned);
    package["version"] = value!(version);
    if package["componentId"].get("version").is_none() {
        let (scope, name) =
            input.identity.split_once('/').ok_or_else(|| invalid("merge package identity"))?;
        package["componentId"] = value!({"name":name,"version":component_version,"scope":scope});
    } else {
        package["componentId"]["version"] = value!(component_version);
    }
    Ok(())
}

pub(super) fn tracked_manifest(version: &Value) -> bool {
    version["files"]
        .as_array()
        .is_some_and(|files| {
            files
                .iter()
                .any(|file| file["relativePath"] == "package.json")
        })
}
