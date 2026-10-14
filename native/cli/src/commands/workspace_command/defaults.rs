//! `commandDefaultNodeReceipt` (`rust-workspace-command-defaults.ts`): what
//! the built-in Node environment's callbacks return for one component, so
//! the engine can build its metadata. Every value is a constant of the
//! environment, apart from the dev files.

use crate::commands::status::{
    fresh::dev_files::{self, Group},
    js::{decline, text},
    policy::Policy,
};
use serde_json::{Value, json};
use std::io;

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
fn app_file(file: &str) -> bool {
    let name = file.rsplit('/').next().unwrap_or(file);
    [".bit-app.", ".node-app.", ".react-app."]
        .iter()
        .any(|marker| {
            name.find(marker)
                .is_some_and(|index| index + marker.len() < name.len())
        })
}

#[cfg(test)]
mod defaults_tests;
