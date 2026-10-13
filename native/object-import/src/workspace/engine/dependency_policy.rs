//! Dependency precedence before env-self and explicit manual additions.
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

pub(super) fn apply(request: &Request) -> io::Result<(usize, Value)> {
    request.validate()?;
    let mut plan = Plan::new(request);
    ignored(request, &mut plan);
    packages::prepare(request, &mut plan);
    automatic::apply(request, &mut plan);
    Ok((1, json!(plan)))
}

fn ignored(request: &Request, plan: &mut Plan) {
    for field in 0..2 {
        plan.components[field].retain(|index| {
            let name = request.entries[*index].package_name.as_deref();
            !name.is_some_and(|name| request.ignore(field, name, &mut plan.removed))
        });
    }
    for (index, issue) in request.missing.iter().enumerate() {
        plan.missing[index].retain(|name| {
            !request.ignore(usize::from(issue.is_dev_file), name, &mut plan.removed)
        });
    }
    for field in 0..2 {
        plan.packages[field].retain(|name, _| !request.ignore(field, name, &mut plan.removed));
    }
    let regular = plan.packages[0].clone();
    plan.packages[1].retain(|name, _| !regular.contains_key(name));
    let identities: Vec<_> = plan.components[0]
        .iter()
        .map(|index| &request.entries[*index].identity)
        .collect();
    plan.components[1].retain(|index| !identities.contains(&&request.entries[*index].identity));
}

/// Plan pure dependency policies synchronously, without creating a workspace session.
pub fn plan(input: &str, finish: bool) -> io::Result<String> {
    if input.len() > 4 * 1024 * 1024 {
        return Err(invalid("dependency policy input limit"));
    }
    let (_, result) = if finish {
        finalize::apply(&serde_json::from_str(input).map_err(io::Error::other)?)?
    } else {
        apply(&serde_json::from_str(input).map_err(io::Error::other)?)?
    };
    let output = serde_json::to_string(&result).map_err(io::Error::other)?;
    if output.len() > 32 * 1024 * 1024 {
        return Err(invalid("dependency policy output limit"));
    }
    Ok(output)
}
