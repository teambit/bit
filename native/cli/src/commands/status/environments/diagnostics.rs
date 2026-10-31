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
    let identity = validated_identity(target)?;
    load_failures(context, identity, dependencies)?;
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
    let bare_env = bit_install::policy::split_version(env).0;
    let workspace_env = array(context.get("targets"), "env diagnostic targets")?
        .iter()
        .any(|target| target["identity"] == bare_env);
    let (kind, data) = if !env.contains('@') && !workspace_env {
        ("ExternalEnvWithoutVersion", json!({"envId":env,"componentId":full_identity(target)?}))
    } else {
        ("NonLoadedEnv", json!(env))
    };
    append_issue(dependencies, kind, &data)
}

fn load_failures(context: &Value, identity: &str, dependencies: &mut Value) -> io::Result<()> {
    let Some(failures) = context["environmentFacts"]["loadFailures"]
        .as_array()
        .or_else(|| context["environmentFacts"][identity]["loadFailures"].as_array())
    else {
        return Ok(());
    };
    let already_has = dependencies["issues"]
        .as_array()
        .is_some_and(|issues| {
            issues
                .iter()
                .any(|issue| issue["type"] == "LoadFailures")
        });
    if already_has {
        return Ok(());
    }
    let matching = failures
        .iter()
        .filter(|entry| {
            entry["failedId"]
                .as_str()
                .is_some_and(|failed| bit_install::policy::split_version(failed).0 == identity)
        })
        .cloned()
        .collect::<Vec<_>>();
    if !matching.is_empty() {
        append_issue(dependencies, "LoadFailures", &Value::Array(matching))?;
    }
    Ok(())
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

fn validated_identity(target: &Value) -> io::Result<&str> {
    let identity = text(target.get("identity"))?.trim();
    if identity.is_empty() {
        return Err(decline("environment target identity is empty"));
    }
    Ok(identity)
}
