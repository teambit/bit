//! `WorkspacePolicyFactory` and package.json precedence for status dependency facts.

use super::{FIELDS, RESOLVER};
use crate::commands::status::js::{assign, decline, nullish, object, string_map};
use serde_json::{Map, Value, json};
use std::io;

/// The workspace policy merged with the root `package.json`, and the
/// `package.json` fields themselves.
pub(super) struct Workspace {
    pub(super) policy: Value,
    pub(super) package_json: [Map<String, Value>; 3],
}

pub(super) fn read(context: &Value) -> io::Result<Workspace> {
    let policy = configured_policy(context)?;
    let package_json = nullish(context.get("packageJson"));
    let field = |name: &str| string_map(package_json.and_then(|json| json.get(name)));
    let package_json = [field(FIELDS[0])?, field(FIELDS[1])?, field(FIELDS[2])?];
    let root = root_policy(&policy)?;
    let mut dependencies = root[0].clone();
    assign(&mut dependencies, &package_json[1]);
    assign(&mut dependencies, &package_json[0]);
    let mut peers = root[1].clone();
    assign(&mut peers, &package_json[2]);
    if let Some(merge) = nullish(context.get("mergeWorkspacePolicy")) {
        let merged = root_policy(merge)?;
        assign(&mut dependencies, &merged[0]);
        assign(&mut peers, &merged[1]);
    }
    let policy = json!({ "dependencies": dependencies, "peerDependencies": peers });
    Ok(Workspace { policy, package_json })
}

fn root_policy(policy: &Value) -> io::Result<[Map<String, Value>; 2]> {
    for field in ["dependencies", "peerDependencies"] {
        let Some(values) = nullish(policy.get(field)) else { continue };
        if !object(values)?.values().all(is_valid_policy_version_entry) {
            return Err(decline("status root dependency policy version"));
        }
    }
    let entries = bit_install::policy::entries::from_workspace_config(policy);
    let manifest = bit_install::policy::workspace_manifest(&entries);
    Ok(manifest.map(|field| {
        field
            .into_iter()
            .map(|(name, version)| (name, json!(version)))
            .collect()
    }))
}

fn configured_policy(context: &Value) -> io::Result<Value> {
    let resolver = nullish(
        crate::commands::update_cmd::aspect_entry(&context["workspace"], RESOLVER)
            .map(|(_, val)| val),
    );
    let policy = nullish(resolver.and_then(|r| r.get("policy")));
    let empty = Value::Object(Map::new());
    let policy = object(policy.unwrap_or(&empty))?;
    Ok(Value::Object(policy.clone()))
}

fn is_valid_policy_version_entry(value: &Value) -> bool {
    value.is_string() || value.get("version").is_some_and(Value::is_string)
}
