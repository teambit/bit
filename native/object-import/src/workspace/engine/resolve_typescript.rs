use super::{
    invalid,
    resolve_dependencies::{Budget, normalize, regular_file},
};
use serde_json::Value;
use std::{
    io,
    path::{Path, PathBuf},
};

// Node10 resolution with the canonical lookup's fixed { module: CommonJS } options.
// Missing results retain canonical lookup, including its CommonJS fallback.
pub(super) fn lookup(
    dependency: &str,
    parent: &Path,
    budget: &Budget,
) -> io::Result<Option<PathBuf>> {
    let relative = dependency == "."
        || dependency == ".."
        || dependency.starts_with("./")
        || dependency.starts_with("../");
    if dependency.len() > 32768
        || dependency.chars().any(char::is_control)
        || dependency.contains(['\\', ':'])
        || !relative
    {
        return Err(invalid("TypeScript dependency spelling"));
    }
    let candidate = normalize(&parent.join(dependency));
    let directory_only =
        dependency.ends_with('/') || matches!(dependency.rsplit('/').next(), Some("." | ".."));
    for typed in [true, false] {
        if let Some(found) = node_candidate(&candidate, directory_only, typed, true, budget)? {
            return Ok(Some(found));
        }
    }
    Ok(None)
}
fn node_candidate(
    file: &Path,
    directory_only: bool,
    typed: bool,
    package: bool,
    budget: &Budget,
) -> io::Result<Option<PathBuf>> {
    if !directory_only && let Some(found) = load_file(file, typed, budget)? {
        return Ok(Some(found));
    }
    if !budget.metadata(file)?.is_some_and(super::source_overlay::Metadata::is_dir) {
        return Ok(None);
    }
    if package && let Some(found) = load_package(file, typed, budget)? {
        return Ok(Some(found));
    }
    load_file(&file.join("index"), typed, budget)
}
fn load_package(file: &Path, typed: bool, budget: &Budget) -> io::Result<Option<PathBuf>> {
    let Some(package) = budget.package(&file.join("package.json"))? else { return Ok(None) };
    if !package.is_object() || package.get("typesVersions").is_some() {
        return Err(invalid("TypeScript package mappings require canonical lookup"));
    }
    let Some(main) = entry(&package, typed) else { return Ok(None) };
    if main.contains(['\\', ':']) || main.chars().any(char::is_control) {
        return Err(invalid("TypeScript package entry spelling"));
    }
    let target = normalize(&file.join(main));
    if let Some(found) = package_file(&target, typed, budget)? {
        return Ok(Some(found));
    }
    node_candidate(&target, false, typed, false, budget)
}
fn entry(package: &Value, typed: bool) -> Option<&str> {
    let fields: &[&str] = if typed { &["typings", "types", "main"] } else { &["main"] };
    fields
        .iter()
        .find_map(|field| {
            package
                .get(field)?
                .as_str()
                .map(str::trim)
                .filter(|value| !value.is_empty())
        })
}
fn package_file(file: &Path, typed: bool, budget: &Budget) -> io::Result<Option<PathBuf>> {
    let text = file.to_str().ok_or_else(|| invalid("TypeScript dependency path"))?;
    if typed
        && [".ts", ".tsx", ".mts", ".cts"]
            .iter()
            .any(|extension| text.ends_with(extension))
    {
        return Ok(regular_file(file, budget)?.then(|| file.to_path_buf()));
    }
    replace_extension(file, typed, budget)
}
fn load_file(file: &Path, typed: bool, budget: &Budget) -> io::Result<Option<PathBuf>> {
    if let Some(found) = replace_extension(file, typed, budget)? {
        return Ok(Some(found));
    }
    append(file, if typed { &[".ts", ".tsx", ".d.ts"] } else { &[".js", ".jsx"] }, budget)
}
fn replace_extension(file: &Path, typed: bool, budget: &Budget) -> io::Result<Option<PathBuf>> {
    let name = file
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| invalid("TypeScript filename"))?;
    let Some(dot) = name.rfind('.') else { return Ok(None) };
    let extension = [".d.ts", ".d.mts", ".d.cts"]
        .into_iter()
        .find(|extension| name.ends_with(extension))
        .unwrap_or_else(|| &name[dot..]);
    let stem = file.with_file_name(&name[..name.len() - extension.len()]);
    let extensions: &[&str] = match (extension, typed) {
        (".mts" | ".mjs" | ".d.mts", true) => &[".mts", ".d.mts"],
        (".mts" | ".mjs" | ".d.mts", false) => &[".mjs"],
        (".cts" | ".cjs" | ".d.cts", true) => &[".cts", ".d.cts"],
        (".cts" | ".cjs" | ".d.cts", false) => &[".cjs"],
        (".jsx" | ".tsx", true) => &[".tsx", ".ts", ".d.ts"],
        (".jsx" | ".tsx", false) => &[".jsx", ".js"],
        (".ts" | ".js" | ".d.ts", true) => &[".ts", ".tsx", ".d.ts"],
        (".ts" | ".js" | ".d.ts", false) => &[".js", ".jsx"],
        (_, true) => return append(&stem, &[&format!(".d{extension}.ts")], budget),
        (_, false) => return Ok(None),
    };
    append(&stem, extensions, budget)
}
fn append(file: &Path, extensions: &[&str], budget: &Budget) -> io::Result<Option<PathBuf>> {
    for extension in extensions {
        let mut candidate = file.as_os_str().to_owned();
        candidate.push(extension);
        let candidate = PathBuf::from(candidate);
        if regular_file(&candidate, budget)? {
            return Ok(Some(candidate));
        }
    }
    Ok(None)
}
