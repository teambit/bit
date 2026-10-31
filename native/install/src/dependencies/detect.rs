//! `AutoDetectDeps`: the dependency data of a component's files before overrides.

mod core;
#[cfg(test)]
mod tests;

use super::{
    Subject, Workspace,
    data::{Detected, LegacyDependency, MissingFile, Untracked, UntrackedFile},
    resolve::{Resolved, ResolvedComponent, Resolver},
    scan,
    versions::valid_component_version,
};
use crate::{
    model::{ComponentId, Lifecycle},
    policy::overrides::field_index,
};
use indexmap::IndexMap;
use std::{io, path::Path};

/// One file's classified imports (a `DependenciesTree` entry).
#[derive(Default)]
struct FileTree {
    packages: IndexMap<String, String>,
    components: Vec<ResolvedComponent>,
    relative: Vec<ComponentId>,
    missing: Vec<String>,
    missing_files: Vec<String>,
    untracked: Vec<String>,
    core_aspects: Vec<core::Import>,
}

/// Detect the dependencies of every file of `subject`.
pub fn detect(
    workspace: &Workspace<'_>,
    subject: &Subject<'_>,
    resolver: &mut Resolver<'_>,
) -> io::Result<Detected> {
    let mut detected = Detected::default();
    for file in &subject.component.files {
        let tree = file_tree(workspace, subject, resolver, file)?;
        let is_dev = subject.dev_files.contains(file);
        populate(workspace, subject, &mut detected, file, tree, is_dev);
    }
    Ok(detected)
}

fn file_tree(
    workspace: &Workspace<'_>,
    subject: &Subject<'_>,
    resolver: &mut Resolver<'_>,
    file: &str,
) -> io::Result<FileTree> {
    let mut tree = FileTree::default();
    let component = subject.component;
    let is_core = workspace.is_core_aspect(&component.id);
    let custom = subject.custom.get(file);
    let specifiers = match custom {
        Some(custom) => custom.specifiers.clone(),
        None => scan::specifiers(&component.dir.join(file))?,
    };
    let typescript = custom.is_some_and(|custom| custom.typescript);
    for specifier in specifiers {
        let lookup = custom.and_then(|custom| custom.lookups.get(&specifier));
        let resolved = match lookup {
            Some(result) => resolver.looked_up(component, file, &specifier, result.as_deref())?,
            None => resolver.resolve_from(component, file, &specifier, typescript)?,
        };
        let resolved = match resolved {
            Resolved::CoreAspect(_) if is_core => {
                resolver.package(&component.dir, &super::resolve::package_name(&specifier))?
            }
            other => other,
        };
        if let Resolved::CoreAspect(id) = resolved {
            tree.core_aspects.push(core::import(resolver, component, &specifier, lookup, id)?);
        } else {
            classify(&mut tree, resolved);
        }
    }
    Ok(tree)
}

fn classify(tree: &mut FileTree, resolved: Resolved) {
    match resolved {
        Resolved::Ignored | Resolved::Internal | Resolved::CoreAspect(_) => {}
        Resolved::OtherComponent(id) => tree.relative.push(id),
        Resolved::Package { name, version } => {
            tree.packages.insert(name, version);
        }
        Resolved::Component(component) => tree.components.push(component),
        Resolved::Missing(name) => {
            if !tree.missing.contains(&name) {
                tree.missing.push(name);
            }
        }
        Resolved::MissingFile(specifier) => {
            if !tree.missing_files.contains(&specifier) {
                tree.missing_files.push(specifier);
            }
        }
        Resolved::Untracked(path) => {
            if !tree.untracked.contains(&path) {
                tree.untracked.push(path);
            }
        }
    }
}

/// `populateDependencies` for one file: core aspects, missing, packages, components, files.
fn populate(
    workspace: &Workspace<'_>,
    subject: &Subject<'_>,
    detected: &mut Detected,
    file: &str,
    mut tree: FileTree,
    is_dev: bool,
) {
    detected.core_aspects.extend(core::ordered(&mut tree.core_aspects));
    let model_packages = subject.model.all_packages();
    tree.missing.retain(|name| match model_packages.get(name) {
        Some(version) => {
            tree.packages.insert(name.clone(), version.clone());
            false
        }
        None => true,
    });
    add_missing_files(subject, detected, file, &tree.missing_files);
    packages(workspace, subject, detected, file, &tree, is_dev);
    if !tree.missing.is_empty() {
        add_missing(detected, file, &tree.missing, is_dev);
    }
    for component in tree.components {
        add_component(subject, detected, component, is_dev);
    }
    for id in tree.relative {
        add_relative(subject, detected, id, is_dev);
    }
    add_untracked(detected, file, &tree.untracked);
}

/// `processMissingFiles`: a relative import naming no file is an issue, unless it
/// names a component file by another extension (`./x.js` for `x.ts`, which the
/// dists will provide).
fn add_missing_files(
    subject: &Subject<'_>,
    detected: &mut Detected,
    file: &str,
    missing: &[String],
) {
    let origin = Path::new(file);
    let base = origin.parent().unwrap_or_else(|| Path::new(""));
    let component_files: Vec<String> = subject.component.files
        .iter()
        .map(|file| without_extension(Path::new(file)))
        .collect();
    let issues: Vec<String> = missing
        .iter()
        .filter(|specifier| {
            let target = Path::new(specifier.as_str());
            if target.extension().is_none() {
                return true;
            }
            let relative = without_extension(&normalize_relative(&base.join(target)));
            !component_files.contains(&relative)
        })
        .cloned()
        .collect();
    if !issues.is_empty() {
        detected.missing_files
            .entry(file.to_owned())
            .or_default()
            .extend(issues);
    }
}

/// `removeFileExtension` of a `/`-separated path.
fn without_extension(path: &Path) -> String {
    path.with_extension("")
        .to_string_lossy()
        .replace('\\', "/")
}

/// Resolve `.` and `..` of a relative path without touching the filesystem.
fn normalize_relative(path: &Path) -> std::path::PathBuf {
    let mut result = std::path::PathBuf::new();
    for part in path.components() {
        match part {
            std::path::Component::ParentDir => {
                if !result.pop() {
                    result.push("..");
                }
            }
            std::path::Component::CurDir => {}
            other => result.push(other),
        }
    }
    result
}

/// `_pushToUntrackDependenciesIssues`: a file imported by more than one file of the
/// component is marked `existing` on every entry.
fn add_untracked(detected: &mut Detected, file: &str, untracked: &[String]) {
    for path in untracked {
        let mut existing = false;
        for entry in detected.untracked.values_mut() {
            for found in entry.files
                .iter_mut()
                .filter(|found| &found.relative_path == path)
            {
                found.existing = true;
                existing = true;
            }
        }
        detected.untracked
            .entry(file.to_owned())
            .or_insert_with(|| Untracked { nested: false, files: Vec::new() })
            .files
            .push(UntrackedFile { relative_path: path.clone(), existing });
    }
}

fn packages(
    workspace: &Workspace<'_>,
    subject: &Subject<'_>,
    detected: &mut Detected,
    file: &str,
    tree: &FileTree,
    is_dev: bool,
) {
    let model_packages = subject.model.all_packages();
    let mut found = tree.packages.clone();
    for (name, version) in &mut found {
        if !workspace.manifest[0].contains_key(name)
            && let Some(model) = model_packages.get(name)
        {
            version.clone_from(model);
        }
    }
    let typescript = file.ends_with(".ts") || file.ends_with(".tsx");
    if typescript {
        let names = found.keys().chain(tree.missing.iter());
        let types: Vec<(String, String)> =
            names.filter_map(|name| types_package(workspace, subject, name)).collect();
        detected.packages[field_index(Lifecycle::Dev)].extend(types);
    }
    let field = if is_dev { Lifecycle::Dev } else { Lifecycle::Runtime };
    detected.packages[field_index(field)].extend(found);
}

/// `_addTypesPackagesForTypeScript`: `@types/<name>` from the workspace policy, else the model.
fn types_package(
    workspace: &Workspace<'_>,
    subject: &Subject<'_>,
    name: &str,
) -> Option<(String, String)> {
    let types = definitely_typed(name);
    workspace.manifest
        .iter()
        .find_map(|field| field.get(&types).cloned())
        .or_else(|| subject.model.packages()[field_index(Lifecycle::Dev)].get(&types).cloned())
        .map(|version| (types, version))
}

/// `packageToDefinetlyTyped`.
#[must_use]
pub fn definitely_typed(name: &str) -> String {
    let name = name.trim();
    let escaped = name
        .strip_prefix('@')
        .and_then(|rest| rest.split_once('/'))
        .filter(|(scope, _)| {
            !scope.is_empty()
                && scope
                    .bytes()
                    .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'_' | b'-'))
        })
        .map_or_else(|| name.to_owned(), |(scope, package)| format!("{scope}__{package}"));
    format!("@types/{escaped}")
}

fn add_missing(detected: &mut Detected, file: &str, missing: &[String], is_dev: bool) {
    if let Some(entry) = detected.missing
        .iter_mut()
        .find(|entry| entry.file == file)
    {
        let mut merged = missing.to_vec();
        merged.append(&mut entry.packages);
        let mut unique: Vec<String> = Vec::with_capacity(merged.len());
        for name in merged {
            if !unique.contains(&name) {
                unique.push(name);
            }
        }
        entry.packages = unique;
        return;
    }
    detected.missing.push(MissingFile {
        file: file.to_owned(),
        packages: missing.to_vec(),
        is_dev,
    });
}

/// `processComponents` → `_pushToDependenciesIfNotExist`.
fn add_component(
    subject: &Subject<'_>,
    detected: &mut Detected,
    component: ResolvedComponent,
    is_dev: bool,
) {
    let mut id = component.id;
    if same(&id, &subject.component.id) {
        return;
    }
    if let Some(version) = component.version.as_deref().and_then(valid_component_version) {
        id.version = Some(version);
    }
    let exists = |field: Lifecycle| {
        detected.components[field_index(field)].iter().any(|dep| same(&dep.id, &id))
    };
    if exists(Lifecycle::Runtime) || (exists(Lifecycle::Dev) && is_dev) {
        return;
    }
    let field = match (is_dev, component.peer_range.is_some()) {
        (true, _) => Lifecycle::Dev,
        (false, true) => Lifecycle::Peer,
        (false, false) => Lifecycle::Runtime,
    };
    detected.components[field_index(field)].push(LegacyDependency {
        id,
        package_name: Some(component.package_name),
        version_range: component.peer_range,
    });
}

/// `processDepFiles`: a relative import of another component's file.
fn add_relative(subject: &Subject<'_>, detected: &mut Detected, id: ComponentId, is_dev: bool) {
    if same(&id, &subject.component.id) {
        return;
    }
    let exists = [Lifecycle::Runtime, Lifecycle::Dev]
        .iter()
        .any(|field| detected.components[field_index(*field)].iter().any(|dep| same(&dep.id, &id)));
    if exists {
        return;
    }
    let field = if is_dev { Lifecycle::Dev } else { Lifecycle::Runtime };
    detected.components[field_index(field)].push(LegacyDependency {
        id,
        package_name: None,
        version_range: None,
    });
}

/// `isEqualWithoutVersion`.
#[must_use]
pub fn same(left: &ComponentId, right: &ComponentId) -> bool {
    left.name.trim() == right.name.trim()
        && left.effective_scope().map(str::trim) == right.effective_scope().map(str::trim)
}
