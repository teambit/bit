//! Package and component dependency [`prepare`] helpers on [`Plan`] under [`Policy`] rules.

use super::{
    Plan, Request,
    wire::{Policy, version},
};
use serde_json::{Map, Value};

/// Prepares package and component dependency buckets on `plan` according to `request` policies.
#[inline]
pub(super) fn prepare(request: &Request, plan: &mut Plan) {
    model_peers(request, plan);
    policy(&request.policies.package_policy, plan);
    policy(&request.policies.workspace_policy, plan);
    components(request, plan);
    legacy(plan);
}
/// Promotes runtime or dev packages listed in model-peer policies into peer package dependencies on `plan`.
fn model_peers(request: &Request, plan: &mut Plan) {
    if request.policies.model_peers.is_empty() {
        return;
    }
    let mut peers = Map::with_capacity(request.policies.model_peers.len());
    for (name, value) in &request.policies.model_peers {
        let name = name.trim();
        if name.is_empty() || request.ignore(2, name, &mut plan.removed) {
            continue;
        }
        for field in 0..2 {
            if plan.packages[field].shift_remove(name).is_some() {
                peers.insert(name.to_owned(), value.clone());
            }
        }
    }
    plan.packages[2] = peers;
}
/// Applies `policy` (`dependencies` and `peerDependencies`) across all package buckets on `plan`.
fn policy(policy: &Policy, plan: &mut Plan) {
    for field in 0..3 {
        let names: Vec<_> = plan.packages[field]
            .keys()
            .cloned()
            .collect();
        for name in names {
            apply_package_policy(policy, plan, field, &name);
        }
    }
}
/// Applies `policy` peer or runtime version overrides for `name` onto `plan.packages`.
#[inline]
fn apply_package_policy(policy: &Policy, plan: &mut Plan, field: usize, name: &str) {
    let trimmed = name.trim();
    if let Some(value) = version(&policy.peer_dependencies, trimmed) {
        plan.packages[field].shift_remove(name);
        plan.packages[2].insert(trimmed.to_owned(), Value::String(value));
    } else if let Some(value) = version(&policy.dependencies, trimmed) {
        plan.packages[2].shift_remove(trimmed);
        plan.packages[field].shift_remove(name);
        plan.packages[field].insert(trimmed.to_owned(), Value::String(value));
    }
}
fn components(request: &Request, plan: &mut Plan) {
    for field in 0..2 {
        let indices = std::mem::take(&mut plan.components[field]);
        let mut retained = Vec::with_capacity(indices.len());
        for index in indices {
            if apply_component_policy(request, plan, index) {
                retained.push(index);
            }
        }
        plan.components[field] = retained;
    }
}

#[inline]
fn apply_component_policy(request: &Request, plan: &mut Plan, index: usize) -> bool {
    let name = effective_package_name(request.entries[index].package_name.as_deref());
    if let Some(value) = version(&request.policies.workspace_policy.peer_dependencies, name) {
        plan.ranges[index] = Some(value);
        if !plan.components[2].contains(&index) {
            plan.components[2].push(index);
        }
        return false;
    }
    if let Some(value) = version(&request.policies.workspace_policy.dependencies, name) {
        plan.ranges[index] = Some(value);
    }
    true
}

#[inline]
fn effective_package_name(name: Option<&str>) -> &str {
    name.map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or("undefined")
}
#[inline]
fn legacy(plan: &mut Plan) {
    let name = "@teambit/legacy";
    let regular = version(&plan.packages[0], name);
    let dev = version(&plan.packages[1], name);
    if regular.is_some() {
        plan.packages[0].shift_remove(name);
    }
    if dev.is_some() {
        plan.packages[1].shift_remove(name);
    }
    if let Some(value) = regular.or(dev) {
        // Canonical Number.isNaN(version[0]) is false for every string character.
        plan.packages[2].insert(name.to_owned(), Value::String(format!("^{value}")));
    }
}
