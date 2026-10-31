//! `extractDepsFromLegacy`: the `dependency-resolver` dependency list of a component.

use super::{
    Subject, Workspace,
    data::{Detected, id_from_object},
    versions::{self, VersionInputs},
};
use crate::{
    model::{
        ComponentDependencies, ComponentDependency, ComponentId, Lifecycle, PackageDependency,
        PolicyEntry,
    },
    policy::split_version,
};
use serde_json::Value;

const LIFECYCLES: [Lifecycle; 3] = [Lifecycle::Runtime, Lifecycle::Dev, Lifecycle::Peer];

/// Build the final list: component dependencies, configured extensions, packages,
/// then model dependencies of packages that are missing on the file system.
pub fn build(
    workspace: &Workspace<'_>,
    subject: &Subject<'_>,
    inputs: &VersionInputs<'_>,
    detected: &Detected,
    policy: Vec<PolicyEntry>,
) -> ComponentDependencies {
    let mut list = ComponentDependencies::default();
    for (index, lifecycle) in LIFECYCLES.iter().enumerate() {
        for dependency in &detected.components[index] {
            let package_name = dependency.package_name
                .clone()
                .unwrap_or_else(|| workspace.package_name(&dependency.id));
            list.components.push(component(dependency.id.clone(), package_name, *lifecycle, false));
        }
    }
    list.components.extend(extensions(workspace, subject, inputs));
    for (index, lifecycle) in LIFECYCLES.iter().enumerate() {
        for (name, version) in &detected.packages[index] {
            list.packages.push(PackageDependency {
                name: name.clone(),
                version: version.clone(),
                lifecycle: *lifecycle,
                optional: false,
            });
        }
    }
    missing_from_model(subject, detected, &mut list);
    apply_policy_flags(&policy, &mut list);
    list.policy = policy;
    list.missing_packages = missing(detected);
    list
}

fn component(
    id: ComponentId,
    package_name: String,
    lifecycle: Lifecycle,
    is_extension: bool,
) -> ComponentDependency {
    ComponentDependency {
        id,
        package_name,
        lifecycle,
        is_extension,
        optional: false,
        hidden: false,
    }
}

/// Configured aspects that are components (not core aspects) are dev dependencies.
fn extensions(
    workspace: &Workspace<'_>,
    subject: &Subject<'_>,
    inputs: &VersionInputs<'_>,
) -> Vec<ComponentDependency> {
    subject.component.config
        .keys()
        .filter_map(|key| extension_id(workspace, key))
        .map(|id| {
            let id = resolve_extension_id(workspace, subject, inputs, id);
            let package_name = workspace.package_name(&id);
            component(id, package_name, Lifecycle::Dev, true)
        })
        .collect()
}

/// `resolveExtensionsList`: a workspace component's `.bitmap` id, else the configured
/// version, which a dependency of the component on another version does not change.
fn resolve_extension_id(
    workspace: &Workspace<'_>,
    subject: &Subject<'_>,
    inputs: &VersionInputs<'_>,
    id: ComponentId,
) -> ComponentId {
    if let Some(local) = workspace.bitmap_id(&id) {
        return local.clone();
    }
    if id.version.is_some() {
        return id;
    }
    versions::resolve(workspace, subject, inputs, &id, Lifecycle::Dev, None).unwrap_or(id)
}

fn extension_id(workspace: &Workspace<'_>, key: &str) -> Option<ComponentId> {
    if key.starts_with("file:") {
        return None;
    }
    let (id, version) = split_version(key);
    if workspace.is_core_aspect_id(id) {
        return None;
    }
    let (scope, name) = id.split_once('/')?;
    Some(ComponentId {
        scope: Some(scope.to_owned()),
        default_scope: None,
        name: name.to_owned(),
        version: version.map(str::to_owned),
    })
}

/// `getMissingDependenciesByComponentFromModel`.
fn missing_from_model(
    subject: &Subject<'_>,
    detected: &Detected,
    list: &mut ComponentDependencies,
) {
    let missing = detected.missing_packages();
    if missing.is_empty() || !subject.model.exists() {
        return;
    }
    for dependency in subject.model.serialized_dependencies() {
        let Some(package_name) = serialized_package_name(&dependency) else { continue };
        if missing.contains(&package_name) {
            add_serialized(&dependency, package_name, list);
        }
    }
}

/// One serialized `dependency-resolver` dependency of the model.
fn add_serialized(dependency: &Value, package_name: String, list: &mut ComponentDependencies) {
    let lifecycle = lifecycle(&dependency["lifecycle"]);
    let version = dependency["version"]
        .as_str()
        .unwrap_or_default()
        .to_owned();
    if dependency["__type"] != "component" {
        list.packages.push(PackageDependency {
            name: package_name,
            version,
            lifecycle,
            optional: false,
        });
        return;
    }
    let Some(mut id) = id_from_object(&dependency["componentId"]) else {
        return;
    };
    if !version.is_empty() {
        id.version = Some(version);
    }
    let is_extension = dependency["isExtension"].as_bool().unwrap_or(false);
    list.components.push(component(id, package_name, lifecycle, is_extension));
}

fn serialized_package_name(dependency: &Value) -> Option<String> {
    let field = if dependency["__type"] == "component" { "packageName" } else { "id" };
    dependency[field]
        .as_str()
        .map(str::trim)
        .filter(|name| !name.is_empty())
        .map(str::to_owned)
}

fn lifecycle(value: &Value) -> Lifecycle {
    match value.as_str() {
        Some("dev") => Lifecycle::Dev,
        Some("peer") => Lifecycle::Peer,
        _ => Lifecycle::Runtime,
    }
}

/// `hidden` and `optional` come from the first policy entry naming the dependency.
fn apply_policy_flags(policy: &[PolicyEntry], list: &mut ComponentDependencies) {
    let find = |name: &str| {
        policy
            .iter()
            .find(|entry| entry.name == name)
    };
    for package in &mut list.packages {
        if let Some(entry) = find(&package.name) {
            package.optional = entry.optional;
        }
    }
    for component in &mut list.components {
        if let Some(entry) = find(&component.package_name) {
            component.optional = entry.optional;
            component.hidden = entry.hidden;
        }
    }
}

fn missing(detected: &Detected) -> crate::model::MissingPackages {
    let mut result = crate::model::MissingPackages::default();
    for entry in &detected.missing {
        let target = if entry.is_dev { &mut result.dev } else { &mut result.runtime };
        for name in &entry.packages {
            if !target.contains(name) {
                target.push(name.clone());
            }
        }
    }
    result
}
