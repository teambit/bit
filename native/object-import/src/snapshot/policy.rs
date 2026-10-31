use super::{hash, invalid};
use serde::Deserialize;
use serde_json::{Value, json};
use std::io;
#[derive(Deserialize)]
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
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct HeadPolicy {
    set_head_as_parent: bool,
    detach_head: bool,
    override_head: bool,
}

pub(super) fn plan(plan: &Plan) -> io::Result<Value> {
    validate(plan)?;
    let detached = detached(plan)?;
    let mut output = json!({"detached":detached,"tag":plan.tag});
    if let Some(parent) = parent(plan) {
        output["parent"] = json!(parent);
    }
    Ok(output)
}
fn validate(plan: &Plan) -> io::Result<()> {
    hash(&plan.hash)?;
    if let Some(head) = &plan.head {
        hash(head)?;
    }
    if let Some(parent) = &plan.parent {
        hash(parent)?;
    }
    if plan.version.is_empty() || plan.version.len() > 256 || plan.version.contains('\0') {
        return Err(invalid("snapshot invalid version"));
    }
    if plan.head_policy.detach_head && plan.head_policy.override_head {
        return Err(invalid("snapshot conflicting head options"));
    }
    Ok(())
}
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
fn parent(plan: &Plan) -> Option<&str> {
    let head = plan.head.as_deref()?.trim();
    if plan.is_legacy || head.eq_ignore_ascii_case(plan.version.trim()) || plan.has_tag {
        return None;
    }
    if plan.head_policy.set_head_as_parent {
        return Some(head);
    }
    Some(plan.parent.as_deref().map_or(head, str::trim))
}
