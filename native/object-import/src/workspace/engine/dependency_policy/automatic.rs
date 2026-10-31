use super::{Plan, Request, wire::version};
use serde_json::Value;
use std::collections::HashSet;

pub(super) fn apply(request: &Request, plan: &mut Plan) {
    let mut seen = HashSet::new();
    for field in 0..3 {
        for (name, value) in &request.policies.automatic[field] {
            if request.ignore(2, name, &mut plan.removed) || !detected(request, plan, name, &seen) {
                continue;
            }
            seen.insert(name.clone());
            update(request, plan, field, name, value);
        }
    }
}
fn detected(request: &Request, plan: &Plan, name: &str, seen: &HashSet<String>) -> bool {
    plan.components
        .iter()
        .flatten()
        .any(|index| request.entries[*index].package_name.as_deref() == Some(name))
        || request.packages
            .iter()
            .any(|map| version(map, name).is_some())
        || seen.contains(name)
        || plan.missing
            .iter()
            .flatten()
            .any(|missing| missing == name)
}
fn update(request: &Request, plan: &mut Plan, field: usize, name: &str, value: &Value) {
    let existing: [Option<usize>; 3] = std::array::from_fn(|field| {
        plan.components[field]
            .iter()
            .copied()
            .find(|index| request.entries[*index].package_name.as_deref() == Some(name))
    });
    if field == 2 && peers(request, plan, name, &existing) {
        return;
    }
    for packages in &mut plan.packages {
        packages.shift_remove(name);
    }
    if value == "-" || ((existing[0].is_some() || existing[1].is_some()) && field != 2) {
        return;
    }
    assign(plan, field, name, value, &existing);
}
fn assign(plan: &mut Plan, field: usize, name: &str, value: &Value, existing: &[Option<usize>; 3]) {
    let range = value
        .as_str()
        .map_or("", str::trim)
        .to_owned();
    if field == 2
        && let Some(index) = existing[0].or(existing[1])
    {
        plan.ranges[index] = Some(range.clone());
        plan.components[2].push(index);
    } else {
        plan.packages[field].insert(name.to_owned(), value.clone());
    }
    if let Some(index) = existing[2] {
        plan.ranges[index] = Some(range);
    }
}
fn peers(request: &Request, plan: &mut Plan, name: &str, existing: &[Option<usize>; 3]) -> bool {
    plan.packages[0].shift_remove(name);
    plan.packages[1].shift_remove(name);
    if name.starts_with("@types/") {
        plan.packages[2].shift_remove(name);
        return true;
    }
    for (field, found) in existing.iter().enumerate().take(2) {
        if found.is_some() {
            plan.components[field].retain(|index| {
                request.entries[*index].package_name.as_deref() != Some(name)
            });
        }
    }
    false
}
