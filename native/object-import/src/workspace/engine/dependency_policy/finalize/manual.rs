use super::{Output, Request, wire::unversioned};
use crate::workspace::engine::dependency_policy::wire::{Entry, version};
use serde_json::{Map, Value};
use std::collections::HashSet;

struct Additions {
    components: [Vec<usize>; 3],
    packages: [Map<String, Value>; 3],
    removals: HashSet<String>,
}
pub(super) fn apply(request: &Request, output: &mut Output) {
    let mut additions = Additions {
        components: std::array::from_fn(|_| Vec::new()),
        packages: std::array::from_fn(|_| Map::new()),
        removals: HashSet::new(),
    };
    for field in 0..3 {
        for (name, value) in &request.manual[field] {
            add(request, output, field, name, value, &mut additions);
        }
    }
    output.missing.retain(|name| !additions.removals.contains(name));
    promote(output, &additions.components, &additions.packages);
}
fn add(
    request: &Request,
    output: &mut Output,
    field: usize,
    name: &str,
    value: &Value,
    additions: &mut Additions,
) {
    if value == "-" || component(request, output, field, name, value, &mut additions.components) {
        return;
    }
    if let Some(value) = package_version(request, name, value) {
        output.added(field, format!("{name}@{value}"));
        additions.packages[field].insert(name.to_owned(), Value::String(value));
        if !request.resolved.contains_key(name) {
            output.missing.push(name.to_owned());
        }
        return;
    }
    output.missing.push(name.to_owned());
    if output.state.packages
        .iter()
        .any(|map| version(map, name).is_some())
    {
        additions.removals.insert(name.to_owned());
    }
}

fn component(
    request: &Request,
    output: &mut Output,
    field: usize,
    name: &str,
    value: &Value,
    components: &mut [Vec<usize>; 3],
) -> bool {
    let Some(resolved) = request.resolved.get(name) else {
        return false;
    };
    let Some(identity) = &resolved.component_identity else {
        return false;
    };
    if unversioned(identity) == unversioned(&request.self_identity) {
        output.ignored_self.push(identity.clone());
        return true;
    }
    if output.state.components[field]
        .iter()
        .any(|index| unversioned(&output.state.entries[*index].identity) == unversioned(identity))
    {
        return true;
    }
    output.added(field, identity.clone());
    components[field].push(output.state.entries.len());
    output.state.entries.push(Entry {
        identity: identity.clone(),
        package_name: Some(resolved.name.clone()),
        version_range: value.as_str().map(str::to_owned),
        version_from_config: false,
    });
    true
}
fn package_version(request: &Request, name: &str, value: &Value) -> Option<String> {
    if value != "+" {
        return value
            .as_str()
            .filter(|value| !value.is_empty())
            .map(str::to_owned);
    }
    request.package_json
        .iter()
        .find(|map| map.contains_key(name))
        .and_then(|map| version(map, name))
}
fn promote(output: &mut Output, components: &[Vec<usize>; 3], packages: &[Map<String, Value>; 3]) {
    for field in 0..3 {
        let names: HashSet<_> = components[field]
            .iter()
            .filter_map(|index| output.state.entries[*index].package_name.clone())
            .collect();
        output.state.components[field].extend(&components[field]);
        output.state.packages[field].extend(packages[field].clone());
        for other in (0..3).filter(|other| *other != field) {
            output.state.components[other].retain(|index| {
                !names.contains(output.state.entries[*index].package_name.as_deref().unwrap_or(""))
            });
            for name in packages[field].keys() {
                output.state.packages[other].shift_remove(name);
            }
        }
    }
    let names: HashSet<_> = output.state.components
        .iter()
        .flatten()
        .filter_map(|index| output.state.entries[*index].package_name.clone())
        .collect();
    for map in &mut output.state.packages {
        map.retain(|name, _| !names.contains(name));
    }
}
