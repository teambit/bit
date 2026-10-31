use super::{
    Plan, Request,
    wire::{Policy, version},
};
use serde_json::{Map, Value};

pub(super) fn prepare(request: &Request, plan: &mut Plan) {
    model_peers(request, plan);
    policy(&request.policies.package_policy, plan);
    policy(&request.policies.workspace_policy, plan);
    components(request, plan);
    legacy(plan);
}
fn model_peers(request: &Request, plan: &mut Plan) {
    if request.policies.model_peers.is_empty() {
        return;
    }
    let mut peers = Map::new();
    for (name, value) in &request.policies.model_peers {
        if request.ignore(2, name, &mut plan.removed) {
            continue;
        }
        for field in 0..2 {
            if plan.packages[field].shift_remove(name).is_some() {
                peers.insert(name.clone(), value.clone());
            }
        }
    }
    plan.packages[2] = peers;
}
fn policy(policy: &Policy, plan: &mut Plan) {
    for field in 0..3 {
        let names: Vec<_> = plan.packages[field]
            .keys()
            .cloned()
            .collect();
        for name in names {
            if let Some(value) = version(&policy.peer_dependencies, &name) {
                plan.packages[field].shift_remove(&name);
                plan.packages[2].insert(name, Value::String(value));
            } else if let Some(value) = version(&policy.dependencies, &name) {
                plan.packages[2].shift_remove(&name);
                plan.packages[field].insert(name, Value::String(value));
            }
        }
    }
}
fn components(request: &Request, plan: &mut Plan) {
    for field in 0..2 {
        let mut retained = Vec::new();
        for index in &std::mem::take(&mut plan.components[field]) {
            let name = effective_package_name(request.entries[*index].package_name.as_deref());
            if let Some(value) = version(&request.policies.workspace_policy.peer_dependencies, name)
            {
                plan.ranges[*index] = Some(value);
                plan.components[2].push(*index);
                continue;
            }
            if let Some(value) = version(&request.policies.workspace_policy.dependencies, name) {
                plan.ranges[*index] = Some(value);
            }
            retained.push(*index);
        }
        plan.components[field] = retained;
    }
}

fn effective_package_name(name: Option<&str>) -> &str {
    name.map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or("undefined")
}
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
