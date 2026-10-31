//! What the built-in Node environment's callbacks return for one component, so
//! the engine can build its metadata. Every value is a constant of the
//! environment, apart from the dev files.

#[cfg(test)]
mod defaults_tests;

use super::{Engine, Request, checkout_scope, checkout_selection};
use crate::commands::status::{
    cache,
    fresh::{
        dependency_grammar,
        dev_files::{self, Group},
    },
    js::{array, decline, object, text, truthy},
    policy::Policy,
};
use serde_json::{Value, json};
use std::{
    env,
    ffi::OsString,
    io,
    path::{Path, PathBuf},
};

const NODE_ENV: &str = "teambit.harmony/node";
/// The Node environment's icon.
const NODE_ENV_ICON: &str = "https://static.bit.dev/extensions-icons/nodejs.svg";
const TEST_PATTERNS: [&str; 2] = ["**/*.spec.+(js|ts|jsx|tsx)", "**/*.test.+(js|ts|jsx|tsx)"];
const DOCS_PATTERNS: [&str; 1] = ["**/*.docs.*"];
const COMPOSITIONS_PATTERNS: [&str; 1] = ["**/*.composition?(s).*"];

/// `VariantPolicy.mergePolices([EnvPolicy.fromConfigObject(getNodeDependencyPolicy()),
/// VariantPolicy.fromConfigObject({}, { source: 'config' })]).serialize()`.
fn policy_entries() -> Value {
    let dev = |id: &str, version: &str| {
        json!({ "source": "env", "force": true, "hidden": false, "dependencyId": id,
            "value": { "version": version, "resolveFromEnv": false }, "lifecycleType": "dev" })
    };
    let peer = |id: &str| {
        json!({ "source": "env", "force": false, "optional": false, "dependencyId": id,
            "value": { "version": "^17.0.0 || ^18.0.0 || ^19.0.0", "resolveFromEnv": false }, "lifecycleType": "peer" })
    };
    json!([
        dev("@types/jest", "26.0.20"),
        dev("@types/node", "22.10.5"),
        peer("react"),
        peer("react-dom")
    ])
}

/// The receipt for `target` with `files`; compositions, docs and app files,
/// which need their aspects' callbacks, decline.
pub fn receipt(target: &Value, policy: &Policy, files: &[String]) -> io::Result<Value> {
    if text(target.get("identity"))? == NODE_ENV {
        return Err(decline("command environment component"));
    }
    let compositions = dev_files::group_files(files, Group::Compositions);
    let docs = dev_files::group_files(files, Group::Docs);
    if !compositions.is_empty() || !docs.is_empty() || files.iter().any(|file| app_file(file)) {
        return Err(decline("command configured source callbacks"));
    }
    let prefix = policy.input["resolution"]
        .get("prefix")
        .cloned()
        .unwrap_or(Value::Null);
    Ok(json!({
        "env": { "id": NODE_ENV, "data": { "type": "node", "id": NODE_ENV, "icon": NODE_ENV_ICON } },
        "policyEntries": policy_entries(),
        "componentRangePrefix": prefix,
        "devPatterns": {
            "config": [],
            "teambit.defender/tester": TEST_PATTERNS,
            "teambit.compositions/compositions": COMPOSITIONS_PATTERNS,
            "teambit.docs/docs": DOCS_PATTERNS,
            NODE_ENV: [],
        },
        "devFiles": {
            "config": [],
            "teambit.defender/tester": dev_files::group_files(files, Group::Tests),
            "teambit.compositions/compositions": compositions,
            "teambit.docs/docs": docs,
            NODE_ENV: [],
        },
        "slotData": slot_data(),
    }))
}

/// Unused Node defaults for the separately validated callback extension projection.
pub fn callback_receipt(policy: &Policy) -> io::Result<Value> {
    receipt(&json!({"identity":"native/callback"}), policy, &[])
}

/// The unconfigured core slots: schema, pkg, preview, compositions and docs.
fn slot_data() -> Value {
    json!([
        { "id": "teambit.semantics/schema", "data": { "disabled": false }, "undefinedKeys": [] },
        {
            "id": "teambit.pkg/pkg",
            "data": { "packageJsonModification": { "main": "dist/{main}.js", "types": "{main}.ts" } },
            "undefinedKeys": [],
        },
        {
            "id": "teambit.preview/preview",
            "data": {
                // `coreEnvDoesScaling(isNew, strategyName !== 'component')`:
                // true for every component under the component strategy.
                "doesScaling": true,
                "onlyOverview": true,
                "useNameParam": true,
                "strategyName": "component",
                "splitComponentBundle": false,
            },
            "undefinedKeys": [],
        },
        { "id": "teambit.compositions/compositions", "data": { "compositions": [] }, "undefinedKeys": [] },
        { "id": "teambit.docs/docs", "data": {}, "undefinedKeys": ["doc"] },
    ])
}

/// `/\.(?:bit-app|node-app|react-app)\.[^/]+$/`.
pub(super) fn app_file(file: &str) -> bool {
    let file = file.trim();
    let name = file
        .rsplit(['/', '\\'])
        .next()
        .unwrap_or(file);
    [".bit-app.", ".node-app.", ".react-app."]
        .iter()
        .any(|marker| {
            name.find(marker)
                .is_some_and(|index| index + marker.len() < name.len())
        })
}

/// The user's home directory, as Node's `os.homedir()` reads it.
pub fn home() -> PathBuf {
    PathBuf::from(
        env::var_os(if cfg!(windows) { "USERPROFILE" } else { "HOME" }).unwrap_or_default(),
    )
}

/// `commandPrepare`: the token, the context and the selected targets.
pub(super) fn prepare(
    engine: &mut Engine,
    root: &Path,
    home: &Path,
    request: &Request<'_>,
    preview_snapshot: bool,
) -> io::Result<(String, Value, Vec<Value>)> {
    let mut options = request.options.clone();
    if options["includeNewFromScope"] == true {
        options["scopeCandidates"] =
            json!(checkout_scope::candidates(engine, root, home, request)?);
    }
    let prepared: Value = engine.request(&json!({
        "kind": "commandPrepare",
        "root": root,
        "home": home,
        "operation": request.operation,
        "internalSnapshotPreview": preview_snapshot,
        "deferCheckoutPattern": checkout_selection::deferred(request),
        "dependencyGrammar": dependency_grammar()?,
        "options": options,
        "globalRemotesFile": cache::cache_root().join("config").join("global-remotes.json"),
    }))?;
    let token = text(prepared.get("token"))?.to_string();
    let context = prepared
        .get("context")
        .filter(|context| truthy(Some(context)))
        .cloned();
    let mut context = context.ok_or_else(|| decline("command context"))?;
    context["commandProgress"] = prepared["progress"].clone();
    let targets = array(prepared.get("targets"), "command targets")?.to_vec();
    Ok((token, context, targets))
}

/// The arguments as UTF-8, or `None`.
pub fn utf8_args(args: &[OsString]) -> Option<Vec<&str>> {
    args.iter()
        .map(|arg| arg.to_str())
        .collect()
}

/// `[options.to ?? '', ...model versions, ...orphaned versions]`.
pub(in crate::commands) fn semver_values(
    to: Option<&str>,
    context: &Value,
) -> io::Result<Vec<String>> {
    let mut values = vec![to.map_or("", str::trim).to_string()];
    for model in array(context.get("models"), "models")? {
        for field in ["versions", "orphanedVersions"] {
            if let Some(versions) = model
                .get(field)
                .filter(|versions| !versions.is_null())
            {
                values.extend(object(versions)?.keys().cloned());
            }
        }
    }
    Ok(values)
}

/// `currentDateAndTimeToFileName()`: local time, unpadded.
pub fn file_id() -> String {
    use chrono::{Datelike, Timelike};
    let now = chrono::Local::now();
    format!(
        "{}-{}-{}-{}-{}-{}",
        now.year(),
        now.month(),
        now.day(),
        now.hour(),
        now.minute(),
        now.second(),
    )
}
