//! Optional package and component flags follow the first merged component policy entry.
use crate::commands::workspace_command::component_service::Loaded;
use bit_install::{
    model::{
        ComponentDependencies, ComponentDependency, ComponentId, EnvPolicy, Lifecycle, PolicyEntry,
        WorkspaceComponent,
    },
    policy,
};
use indexmap::IndexMap;
use serde_json::Value;
use std::io;

pub(super) fn apply(
    components: &[WorkspaceComponent],
    loaded: &Loaded,
    dependencies: &mut IndexMap<String, ComponentDependencies>,
) -> io::Result<()> {
    for component in components {
        let identity = component.id.to_string_without_version();
        let entries = policy::component_policy(component, &EnvPolicy::default(), None, &[]);
        let list = dependencies
            .get_mut(&identity)
            .ok_or_else(|| io::Error::other("compiler dependency list"))?;
        let has_optional = entries.iter().any(|entry| entry.optional);
        for package in &mut list.packages {
            package.optional = has_optional && optional(&entries, &package.name);
        }
        let state = loaded
            .dependency_state(&identity)
            .ok_or_else(|| io::Error::other("compiler component dependency state"))?;
        append(list, state, &entries)?;
    }
    Ok(())
}
fn optional(entries: &[PolicyEntry], name: &str) -> bool {
    let name = name.trim();
    !name.is_empty()
        && entries
            .iter()
            .find(|entry| entry.name.trim() == name)
            .is_some_and(|entry| entry.optional)
}
fn append(
    list: &mut ComponentDependencies,
    state: &Value,
    policy: &[PolicyEntry],
) -> io::Result<()> {
    let entries = state["entries"]
        .as_array()
        .ok_or_else(|| io::Error::other("compiler component dependency entries"))?;
    for (index, lifecycle) in
        [Lifecycle::Runtime, Lifecycle::Dev, Lifecycle::Peer].into_iter().enumerate()
    {
        let indices = state["components"][index]
            .as_array()
            .ok_or_else(|| io::Error::other("compiler dependency lifecycle"))?;
        for index in indices {
            let entry = index
                .as_u64()
                .and_then(|index| usize::try_from(index).ok())
                .and_then(|index| entries.get(index))
                .ok_or_else(|| io::Error::other("compiler dependency index"))?;
            let Some(package) = entry["packageName"].as_str() else { continue };
            if optional(policy, package) {
                list.components.push(component(entry, package, lifecycle)?);
            }
        }
    }
    Ok(())
}
fn component(
    entry: &Value,
    package: &str,
    lifecycle: Lifecycle,
) -> io::Result<ComponentDependency> {
    let (identity, version) = split_component_identity(entry)?;
    let (scope, name) =
        identity.split_once('/').ok_or_else(|| io::Error::other("compiler dependency scope"))?;
    let (scope, name, version, package) =
        (scope.trim(), name.trim(), version.trim(), package.trim());
    if scope.is_empty() || name.is_empty() || version.is_empty() || package.is_empty() {
        return Err(io::Error::other("compiler dependency coordinates"));
    }
    Ok(ComponentDependency {
        id: ComponentId {
            scope: Some(scope.to_owned()),
            default_scope: None,
            name: name.to_owned(),
            version: Some(version.to_owned()),
        },
        package_name: package.to_owned(),
        lifecycle,
        is_extension: false,
        optional: true,
        hidden: false,
    })
}

fn split_component_identity(entry: &Value) -> io::Result<(&str, &str)> {
    let raw = entry["identity"]
        .as_str()
        .or_else(|| entry["id"].as_str())
        .map(str::trim)
        .filter(|val| !val.is_empty())
        .ok_or_else(|| io::Error::other("compiler dependency identity"))?;
    if let Some((base, ver)) = raw
        .rsplit_once('@')
        .filter(|(base, ver)| {
            !base.trim().is_empty() && !base.contains('@') && !ver.trim().is_empty()
        })
    {
        return Ok((base.trim(), ver.trim()));
    }
    let version = entry["version"]
        .as_str()
        .map(str::trim)
        .ok_or_else(|| io::Error::other("compiler dependency version"))?;
    Ok((raw.trim_end_matches('@').trim(), version))
}
