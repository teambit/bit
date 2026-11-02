//! Dependency precedence via [`apply`], [`packages`], and [`automatic`] before [`finalize`].
//! Rows identify caller-owned component dependencies; this planner never hydrates public models.

pub(super) mod cached;
pub(super) mod finalize;
pub(super) mod fresh;
pub(super) mod packages_on_disk;
pub(super) mod pipeline;
pub(super) mod versions;

pub(super) use wire::Request;

mod automatic;
mod packages;
mod wire;

use super::invalid;
use serde_json::{Value, json};
use std::io;
use wire::Plan;

/// Applies ignored-dependency filtering, [`packages::prepare`], and [`automatic::apply`] to `request`.
#[inline]
pub(super) fn apply(request: &Request) -> io::Result<(usize, Value)> {
    request.validate()?;
    let mut plan = Plan::new(request);
    ignored(request, &mut plan);
    packages::prepare(request, &mut plan);
    automatic::apply(request, &mut plan);
    Ok((1, json!(plan)))
}

/// Filters ignored component, missing-issue, and package dependencies out of `plan`.
fn ignored(request: &Request, plan: &mut Plan) {
    for field in 0..2 {
        plan.components[field].retain(|index| {
            let name = request.entries[*index].package_name
                .as_deref()
                .map(str::trim)
                .filter(|name| !name.is_empty());
            !name.is_some_and(|name| request.ignore(field, name, &mut plan.removed))
        });
    }
    for (index, issue) in request.missing.iter().enumerate() {
        plan.missing[index].retain(|name| {
            let trimmed = name.trim();
            !trimmed.is_empty()
                && !request.ignore(usize::from(issue.is_dev_file), trimmed, &mut plan.removed)
        });
    }
    for field in 0..2 {
        plan.packages[field].retain(|name, _| {
            let trimmed = name.trim();
            !trimmed.is_empty() && !request.ignore(field, trimmed, &mut plan.removed)
        });
    }
    deduplicate_dev(request, plan);
}

/// Removes dev packages and dev components from `plan` that are already present in runtime dependencies.
#[inline]
fn deduplicate_dev(request: &Request, plan: &mut Plan) {
    let [regular_packages, dev_packages, _] = &mut plan.packages;
    dev_packages.retain(|name, _| {
        let trimmed = name.trim();
        !regular_packages
            .keys()
            .any(|existing| existing.trim() == trimmed)
    });
    let [regular_components, dev_components, _] = &mut plan.components;
    dev_components.retain(|index| {
        let identity = request.entries[*index].identity.trim();
        !regular_components
            .iter()
            .any(|regular| request.entries[*regular].identity.trim() == identity)
    });
}
