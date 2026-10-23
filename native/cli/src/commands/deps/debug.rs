//! Dependency debug output for fresh components using a built-in environment.

use super::{mutation::format_json_indent_4, resolve::WorkspaceDepsContext};
use crate::commands::{
    color::Chalk,
    scope_set::{Failure, selection},
};
use bit_install::workspace::{Bitmap, BitmapEntry};
use serde_json::{Map, Value, json};
use std::path::Path;

const NODE_DEV: &[(&str, &str)] = &[("@types/jest", "26.0.20"), ("@types/node", "22.10.5")];
const REACT_RUNTIME: &[(&str, &str)] = &[("core-js", "^3.0.0")];
const REACT_DEV: &[(&str, &str)] = &[
    ("@types/node", "12.20.4"),
    ("@types/react", "^19.0.0"),
    ("@types/react-dom", "^19.0.0"),
    ("@types/jest", "^26.0.0"),
    ("@babel/runtime", "7.20.0"),
    ("@types/testing-library__jest-dom", "5.9.5"),
];
const REACT_PEER: &[(&str, &str)] =
    &[("react", "^17.0.0 || ^18.0.0 || ^19.0.0"), ("react-dom", "^17.0.0 || ^18.0.0 || ^19.0.0")];

type Deps = &'static [(&'static str, &'static str)];

pub(super) fn prepare(
    root: &Path,
    bitmap: &Bitmap,
    id: &str,
    chalk: Chalk,
) -> Result<String, Failure> {
    let matched = selection::resolve_pattern_entries(root, bitmap, id, chalk)?;
    let [entry] = matched.as_slice() else {
        return Err(Failure::Declined("deps debug needs one component".into()));
    };
    let ctx = WorkspaceDepsContext::load(root)?;
    let component = ctx
        .find_workspace_component(entry)
        .ok_or_else(|| Failure::Declined("missing workspace component".into()))?;
    validate_simple_component(root, &ctx, entry, component)?;
    let env_deps = builtin_env_deps(&component.env_id)?;
    render_debug(root, env_deps)
}

fn validate_simple_component(
    root: &Path,
    ctx: &WorkspaceDepsContext,
    entry: &BitmapEntry,
    component: &bit_install::model::WorkspaceComponent,
) -> Result<(), Failure> {
    if entry.id.version.is_some() {
        return Err(Failure::Declined("versioned deps debug delegated".into()));
    }
    if !ctx.ws_config.variants.is_empty()
        || !empty_policy(&ctx.ws_config.dependency_resolver.policy)
        || component.has_package_json
        || component.config
            .iter()
            .any(|(key, value)| {
                key != "teambit.envs/envs"
                    && (key != "teambit.react/react"
                        || value
                            .as_object()
                            .is_none_or(|map| !map.is_empty()))
            })
    {
        return Err(Failure::Declined("configured deps debug delegated".into()));
    }
    let (deps, _) = ctx.collect_component_deps(entry, component, None);
    if !deps.is_empty() {
        return Err(Failure::Declined("resolved deps debug delegated".into()));
    }
    if root
        .join(&component.root_dir)
        .join("component.json")
        .exists()
    {
        return Err(Failure::Declined("component config deps debug delegated".into()));
    }
    Ok(())
}

fn builtin_env_deps(env_id: &str) -> Result<(Deps, Deps, Deps), Failure> {
    match env_id {
        "teambit.harmony/node" => Ok((&[], NODE_DEV, &[])),
        "teambit.react/react" => Ok((REACT_RUNTIME, REACT_DEV, REACT_PEER)),
        _ => Err(Failure::Declined("custom env deps debug delegated".into())),
    }
}

fn render_debug(root: &Path, (runtime, dev, peer): (Deps, Deps, Deps)) -> Result<String, Failure> {
    let all = runtime
        .iter()
        .chain(dev)
        .chain(peer)
        .collect::<Vec<_>>();
    if all
        .iter()
        .any(|(name, _)| {
            root.join("node_modules")
                .join(name)
                .exists()
        })
    {
        return Err(Failure::Declined("installed env deps debug delegated".into()));
    }
    let mut added = Map::new();
    if !runtime.is_empty() {
        added.insert("dependencies".into(), versions(runtime));
    }
    added.insert("devDependencies".into(), versions(dev));
    if !peer.is_empty() {
        added.insert("peerDependencies".into(), versions(peer));
    }
    let missing = all
        .iter()
        .map(|(name, _)| *name)
        .collect::<Vec<_>>();
    let sources = all
        .iter()
        .map(|(name, _)| json!({ "id": name, "source": "env" }))
        .collect::<Vec<_>>();
    let value = json!({
        "components": [],
        "manuallyRemovedDependencies": {},
        "manuallyAddedDependencies": added,
        "missingPackageDependencies": missing,
        "coreAspects": [],
        "sources": sources,
    });
    format_json_indent_4(&value).map_err(Failure::from)
}

fn versions(deps: &[(&str, &str)]) -> Value {
    Value::Array(
        deps.iter()
            .map(|(name, version)| Value::String(format!("{name}@{version}")))
            .collect(),
    )
}

fn empty_policy(policy: &Value) -> bool {
    policy.is_null()
        || policy
            .as_object()
            .is_some_and(|map| {
                map.iter()
                    .all(|(key, value)| {
                        matches!(
                            key.as_str(),
                            "dependencies" | "devDependencies" | "peerDependencies",
                        ) && value.as_object().is_some_and(Map::is_empty)
                    })
            })
}
