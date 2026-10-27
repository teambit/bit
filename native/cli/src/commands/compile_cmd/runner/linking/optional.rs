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
        for package in &mut list.packages {
            package.optional = optional(&entries, &package.name);
        }
        let state = loaded
            .dependency_state(&identity)
            .ok_or_else(|| io::Error::other("compiler component dependency state"))?;
        append(list, state, &entries)?;
    }
    Ok(())
}
fn optional(entries: &[PolicyEntry], name: &str) -> bool {
    entries
        .iter()
        .find(|entry| entry.name == name)
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
    let identity = entry["identity"]
        .as_str()
        .ok_or_else(|| io::Error::other("compiler dependency identity"))?;
    let (identity, version) =
        identity.rsplit_once('@').ok_or_else(|| io::Error::other("compiler dependency version"))?;
    let (scope, name) =
        identity.split_once('/').ok_or_else(|| io::Error::other("compiler dependency scope"))?;
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
