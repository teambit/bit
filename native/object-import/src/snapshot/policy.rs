//! Snapshot head, parent, and detached-head policy evaluation ([`Plan`], [`HeadPolicy`], [`plan`]).

use super::{hash, invalid};
use serde::Deserialize;
use serde_json::{Value, json};
use std::io;
/// Deserialized snapshot head, parent, and tag policy input (`snapshotPlan`).
#[derive(Debug, Default, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Plan {
    hash: String,
    version: String,
    head: Option<String>,
    parent: Option<String>,
    has_tag: bool,
    tag: bool,
    is_legacy: bool,
    #[serde(flatten)]
    head_policy: HeadPolicy,
}
/// Head-update policy flags (`setHeadAsParent`, `detachHead`, `overrideHead`) for [`Plan`].
#[derive(Debug, Default, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
struct HeadPolicy {
    set_head_as_parent: bool,
    detach_head: bool,
    override_head: bool,
}

/// Evaluates `detached`, `tag`, and optional `parent` fields for `plan`.
pub(super) fn plan(plan: &Plan) -> io::Result<Value> {
    validate(plan)?;
    let detached = detached(plan)?;
    Ok(match parent(plan) {
        Some(parent) => json!({"detached":detached,"tag":plan.tag,"parent":parent}),
        None => json!({"detached":detached,"tag":plan.tag}),
    })
}
/// Validates `hash`, `head`, `parent`, `version`, and non-conflicting `head_policy` flags on `plan`.
fn validate(plan: &Plan) -> io::Result<()> {
    hash(&plan.hash)?;
    if let Some(head) = &plan.head {
        hash(head)?;
    }
    if let Some(parent) = &plan.parent {
        hash(parent)?;
        if parent.trim().eq_ignore_ascii_case(plan.hash.trim()) {
            return Err(invalid("snapshot self-parent"));
        }
    }
    if plan.version.trim().is_empty()
        || plan.version.len() > 256
        || plan.version.contains('\0')
    {
        return Err(invalid("snapshot invalid version"));
    }
    if plan.head_policy.detach_head && plan.head_policy.override_head {
        return Err(invalid("snapshot conflicting head options"));
    }
    Ok(())
}
/// Returns whether `plan` creates a detached head (`parent != head` with `detach_head: true`).
fn detached(plan: &Plan) -> io::Result<bool> {
    let (Some(parent_hash), Some(head_hash)) = (plan.parent.as_deref(), plan.head.as_deref())
    else {
        return Ok(false);
    };
    if parent_hash.trim().eq_ignore_ascii_case(head_hash.trim())
        || plan.head_policy.override_head
    {
        return Ok(false);
    }
    if !plan.head_policy.detach_head {
        return Err(invalid("snapshot older parent requires explicit head policy"));
    }
    Ok(true)
}
/// Resolves the effective parent hash (`parent` or `head`) to record on the new `Version`.
fn parent(plan: &Plan) -> Option<&str> {
    let head = plan.head
        .as_deref()
        .map(str::trim)
        .filter(|head| !head.is_empty())?;
    if plan.is_legacy || head.eq_ignore_ascii_case(plan.version.trim()) || plan.has_tag {
        return None;
    }
    if !plan.head_policy.set_head_as_parent
        && let Some(parent) = plan.parent
            .as_deref()
            .map(str::trim)
            .filter(|parent| !parent.is_empty())
    {
        return Some(parent);
    }
    Some(head)
}
