//! Environment issue facts after native dependency detection.

use crate::commands::status::js::{array, decline, full_identity, text};
use serde_json::{Value, json};
use std::io;

/// Environment diagnostics are appended after the native dependency calculation.
pub(in crate::commands::status) fn issues(
    context: &Value,
    target: &Value,
    dependencies: &mut Value,
) -> io::Result<()> {
    let identity = text(target.get("identity"))?;
    let facts = &context["environmentFacts"][identity];
    if facts["multiple"]
        .as_array()
        .is_some_and(|ids| ids.len() > 1)
    {
        append_issue(dependencies, "MultipleEnvs", &facts["multiple"])?;
    }
    removed(context, facts, dependencies)?;
    if facts["nonLoaded"] != true {
        return Ok(());
    }
    let env = text(facts.get("envId"))?;
    let workspace_env = array(context.get("targets"), "env diagnostic targets")?
        .iter()
        .any(|target| target["identity"] == env);
    let (kind, data) = if !env.contains('@') && !workspace_env {
        ("ExternalEnvWithoutVersion", json!({"envId":env,"componentId":full_identity(target)?}))
    } else {
        ("NonLoadedEnv", json!(env))
    };
    append_issue(dependencies, kind, &data)
}

fn removed(context: &Value, facts: &Value, dependencies: &mut Value) -> io::Result<()> {
    if let Some(env) = facts["envId"].as_str() {
        for target in array(context.get("targets"), "removed environment targets")? {
            if target["locallyRemoved"] == true
                && target["identity"].as_str() == Some(bit_install::policy::split_version(env).0)
            {
                append_issue(dependencies, "RemovedEnv", &json!(full_identity(target)?))?;
            }
        }
    }
    Ok(())
}

fn append_issue(dependencies: &mut Value, kind: &str, data: &Value) -> io::Result<()> {
    if dependencies["issues"].is_null() {
        dependencies["issues"] = json!([]);
    }
    dependencies["issues"]
        .as_array_mut()
        .ok_or_else(|| decline("environment issues"))?
        .push(json!({"type":kind,"data":data.to_string()}));
    Ok(())
}
