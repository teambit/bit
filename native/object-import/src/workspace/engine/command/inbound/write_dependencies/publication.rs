//! Write dependencies with the published package and JSONC serializers.
#[cfg(test)]
mod tests;
use super::invalid;
use bit_workspace_config::{jsonc::Document, package_json};
use serde_json::{Map, Value, json};
use std::{fs, io, path::Path};

const RESOLVER: &str = "teambit.dependencies/dependency-resolver";

pub(super) fn write(
    root: &Path,
    target: &str,
    dependencies: &Map<String, Value>,
    file_id: &str,
) -> io::Result<()> {
    let target = target.trim();
    let path = root.join(if target == "package.json" { "package.json" } else { "workspace.jsonc" });
    let before = read(&path)?;
    if before.is_none() && target != "package.json" {
        return Err(io::Error::new(io::ErrorKind::NotFound, "workspace configuration absent"));
    }
    let text = before
        .as_deref()
        .map(std::str::from_utf8)
        .transpose()
        .map_err(io::Error::other)?
        .unwrap_or("{}");
    let after = if target == "package.json" {
        package(text, dependencies)?
    } else {
        workspace(text, dependencies)?
    };
    if read(&path)? != before {
        return Err(invalid("inbound dependency configuration changed"));
    }
    if target != "package.json" {
        let _ = backup(root, &path, before.as_deref().unwrap_or_default(), file_id);
    }
    crate::merge_state::write::commit(&path, &after)
}

fn package(text: &str, dependencies: &Map<String, Value>) -> io::Result<String> {
    let mut value: Value = crate::parse_jsonc(text.as_bytes()).map_err(io::Error::other)?;
    let object = value.as_object_mut().ok_or_else(|| invalid("inbound package object"))?;
    let policy = object
        .entry("dependencies")
        .or_insert_with(|| Value::Object(Map::new()));
    let policy = policy.as_object_mut().ok_or_else(|| invalid("inbound package dependencies"))?;
    for (name, range) in dependencies {
        policy.insert(name.clone(), range.clone());
    }
    package_json::stringify_package(
        &value,
        &package_json::detect_indent(text),
        package_json::detect_newline(text),
    )
}

fn workspace(text: &str, dependencies: &Map<String, Value>) -> io::Result<String> {
    let mut document = Document::parse(text)?;
    let mut entries = dependencies
        .iter()
        .map(|(name, value)| (name.clone(), value.clone()))
        .collect::<Vec<_>>();
    entries.sort_by(|(left, _), (right, _)| left.encode_utf16().cmp(right.encode_utf16()));
    document.replace_entries(&[RESOLVER, "policy", "dependencies"], &entries.into_iter().collect());
    document.replace_entries(&[RESOLVER, "policy", "peerDependencies"], &indexmap::IndexMap::new());
    if document
        .get(&[RESOLVER, "linkCoreAspects"])
        .is_none()
    {
        document.set(&[RESOLVER, "linkCoreAspects"], &json!(true));
    }
    String::from_utf8(crate::checkout::eol::normalize(
        format!("{document}\n").into_bytes(),
        cfg!(windows),
    ))
    .map_err(io::Error::other)
}

fn read(path: &Path) -> io::Result<Option<Vec<u8>>> {
    match fs::symlink_metadata(path) {
        Ok(metadata) if metadata.is_file() && !metadata.file_type().is_symlink() => {
            crate::merge_state::write::validate_existing(path)?;
            crate::read_budget::Budget::new(32 * 1024 * 1024)
                .read(fs::File::open(path)?)
                .map(Some)
        }
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(error),
        Ok(_) => Err(invalid("inbound dependency configuration must be a regular file")),
    }
}

fn backup(root: &Path, path: &Path, before: &[u8], file_id: &str) -> io::Result<()> {
    use std::io::Write;
    crate::workspace::engine::command::bitmap::validate_history_file_id(file_id)?;
    let directory = crate::scope_path(root).join("workspace-config-history");
    fs::create_dir_all(directory.join("files"))?;
    let snapshot = directory.join("files").join(file_id);
    fs::copy(path, &snapshot)?;
    if read(&snapshot)?.as_deref() != Some(before) {
        return Err(invalid("inbound workspace configuration backup changed"));
    }
    let mut metadata = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(directory.join("metadata.txt"))?;
    writeln!(metadata, "{file_id} Write dependencies")
}
