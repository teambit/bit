//! Dependency debug output for fresh components using a built-in environment.

use super::{
    mutation::format_json_indent_4,
    resolve::{WorkspaceDepsContext, scanned_specifiers},
};
mod policy;
use crate::commands::{
    color::Chalk,
    scope_set::{Failure, selection},
};
use bit_install::{
    config::DEPENDENCY_RESOLVER_ASPECT,
    workspace::{Bitmap, BitmapEntry},
};
use policy::{apply_lifecycle_precedence, empty_policy, supported_policy, unresolved_plus};
use serde_json::{Map, Value, json};
use std::{collections::HashSet, path::Path};

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
type SourcedDep<'a> = (&'a str, &'a str, &'static str);

#[derive(Default)]
struct ManualPolicy {
    runtime: Vec<(String, String)>,
    dev: Vec<(String, String)>,
    peer: Vec<(String, String)>,
    unresolved_plus: Vec<String>,
    has_ignored_policy: bool,
    ignored_env_dependencies: Vec<String>,
}

impl ManualPolicy {
    fn is_empty(&self) -> bool {
        self.runtime.is_empty()
            && self.dev.is_empty()
            && self.peer.is_empty()
            && self.unresolved_plus.is_empty()
            && !self.has_ignored_policy
    }
}

struct ManualGroups<'a> {
    runtime: Vec<SourcedDep<'a>>,
    dev: Vec<SourcedDep<'a>>,
    peer: Vec<SourcedDep<'a>>,
}

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
    let manual = validate_simple_component(root, &ctx, entry, component)?;
    let env_deps = builtin_env_deps(&component.env_id)?;
    if manual.is_empty() { render_debug(root, env_deps) } else { render_manual(root, &manual) }
}

fn validate_simple_component(
    root: &Path,
    ctx: &WorkspaceDepsContext,
    entry: &BitmapEntry,
    component: &bit_install::model::WorkspaceComponent,
) -> Result<ManualPolicy, Failure> {
    if entry.id.version.is_some() {
        return Err(Failure::Declined("versioned deps debug delegated".into()));
    }
    let manual = manual_policy(entry)?;
    if !manual.is_empty() {
        validate_manual_component(root, ctx, entry, component)?;
        return Ok(manual);
    }
    if !ctx.ws_config.variants.is_empty()
        || !supported_policy(&ctx.ws_config.dependency_resolver.policy)
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
    if !deps.is_empty()
        || !empty_policy(&ctx.ws_config.dependency_resolver.policy)
            && component.files
                .iter()
                .any(|rel_file| !scanned_specifiers(&component.dir, rel_file).is_empty())
    {
        return Err(Failure::Declined("resolved deps debug delegated".into()));
    }
    if root
        .join(&component.root_dir)
        .join("component.json")
        .exists()
    {
        return Err(Failure::Declined("component config deps debug delegated".into()));
    }
    Ok(manual)
}

fn manual_policy(entry: &BitmapEntry) -> Result<ManualPolicy, Failure> {
    let Some(config) = entry.config
        .as_ref()
        .and_then(|config| config.get(DEPENDENCY_RESOLVER_ASPECT))
    else {
        return Ok(ManualPolicy::default());
    };
    parse_manual_config(config)
}

fn parse_manual_config(config: &Value) -> Result<ManualPolicy, Failure> {
    let Some(map) = config.as_object() else {
        return Err(Failure::Declined("unsupported component deps debug policy".into()));
    };
    if map.len() != 1 || !map.contains_key("policy") {
        return Err(Failure::Declined("unsupported component deps debug policy".into()));
    }
    let Some(fields) = map["policy"].as_object() else {
        return Err(Failure::Declined("unsupported component deps debug policy".into()));
    };
    parse_manual_fields(fields)
}

fn parse_manual_fields(fields: &Map<String, Value>) -> Result<ManualPolicy, Failure> {
    let mut manual = ManualPolicy::default();
    for (field, values) in fields {
        let target = match field.as_str() {
            "dependencies" => &mut manual.runtime,
            "devDependencies" => &mut manual.dev,
            "peerDependencies" => &mut manual.peer,
            _ => return Err(Failure::Declined("unsupported component deps debug field".into())),
        };
        manual.has_ignored_policy |= values
            .as_object()
            .is_some_and(|entries| {
                entries
                    .values()
                    .any(|value| value == "-")
            });
        manual.ignored_env_dependencies.extend(
            NODE_DEV
                .iter()
                .filter(|(name, _)| {
                    field == "devDependencies"
                        && values.get(*name).and_then(Value::as_str) == Some("-")
                })
                .map(|(name, _)| (*name).to_owned()),
        );
        manual.unresolved_plus.extend(unresolved_plus(field, values)?);
        target.extend(parse_manual_entries(values)?);
    }
    manual.unresolved_plus.sort();
    apply_lifecycle_precedence(&mut manual);
    Ok(manual)
}

fn parse_manual_entries(values: &Value) -> Result<Vec<(String, String)>, Failure> {
    let Some(entries) = values.as_object() else {
        return Err(Failure::Declined("unsupported component deps debug policy".into()));
    };
    let mut rows = entries
        .iter()
        .map(|(name, value)| {
            let version = manual_version(value)
                .ok_or_else(|| {
                    Failure::Declined("unsupported component deps debug version".into())
                })?;
            if name.is_empty() || version.is_empty() {
                return Err(Failure::Declined("unsupported component deps debug entry".into()));
            }
            Ok((version != "-" && version != "+").then(|| (name.clone(), version.to_owned())))
        })
        .collect::<Result<Vec<_>, _>>()?
        .into_iter()
        .flatten()
        .collect::<Vec<_>>();
    rows.sort_by(|left, right| left.0.cmp(&right.0));
    Ok(rows)
}

fn manual_version(value: &Value) -> Option<&str> {
    if let Some(version) = value.as_str() {
        return Some(version);
    }
    let object = value.as_object()?;
    (object.len() == 2 && object["optional"] == true)
        .then(|| object["version"].as_str())
        .flatten()
}

fn validate_manual_component(
    root: &Path,
    ctx: &WorkspaceDepsContext,
    entry: &BitmapEntry,
    component: &bit_install::model::WorkspaceComponent,
) -> Result<(), Failure> {
    let unsupported_context = component.env_id != "teambit.harmony/node"
        || !ctx.ws_config.variants.is_empty()
        || !empty_policy(&ctx.ws_config.dependency_resolver.policy)
        || component.has_package_json;
    let extra_config = component.config
        .keys()
        .any(|key| key != "teambit.envs/envs" && key != DEPENDENCY_RESOLVER_ASPECT);
    let has_imports = component.files
        .iter()
        .any(|rel_file| !scanned_specifiers(&component.dir, rel_file).is_empty());
    let has_component_json = root
        .join(&component.root_dir)
        .join("component.json")
        .exists();
    if unsupported_context || extra_config || has_imports || has_component_json {
        return Err(Failure::Declined("configured deps debug delegated".into()));
    }
    let mut without_manual = entry.clone();
    if let Some(config) = &mut without_manual.config {
        config.remove(DEPENDENCY_RESOLVER_ASPECT);
    }
    let (deps, _) = ctx.collect_component_deps(&without_manual, component, None);
    if !deps.is_empty() {
        return Err(Failure::Declined("resolved deps debug delegated".into()));
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

fn render_manual(root: &Path, manual: &ManualPolicy) -> Result<String, Failure> {
    let groups = manual_groups(manual);
    let all = groups.runtime
        .iter()
        .chain(&groups.dev)
        .chain(&groups.peer)
        .collect::<Vec<_>>();
    validate_manual_rows(root, &all)?;
    format_json_indent_4(&manual_value(manual, &groups, &all)).map_err(Failure::from)
}

fn manual_groups(manual: &ManualPolicy) -> ManualGroups<'_> {
    let runtime = manual.runtime
        .iter()
        .map(|(name, version)| (name.as_str(), version.as_str(), "config"))
        .collect::<Vec<_>>();
    let mut dev = manual.dev
        .iter()
        .map(|(name, version)| (name.as_str(), version.as_str(), "config"))
        .collect::<Vec<_>>();
    dev.extend(
        NODE_DEV
            .iter()
            .filter(|(name, _)| {
                !manual.ignored_env_dependencies
                    .iter()
                    .any(|ignored| ignored.as_str() == *name)
            })
            .map(|(name, version)| (*name, *version, "env")),
    );
    let peer = manual.peer
        .iter()
        .map(|(name, version)| (name.as_str(), version.as_str(), "config"))
        .collect::<Vec<_>>();
    ManualGroups { runtime, dev, peer }
}

fn validate_manual_rows(root: &Path, all: &[&SourcedDep<'_>]) -> Result<(), Failure> {
    let mut seen = HashSet::new();
    if all
        .iter()
        .any(|(name, _, _)| {
            !seen.insert(*name)
                || root
                    .join("node_modules")
                    .join(name)
                    .exists()
        })
    {
        return Err(Failure::Declined("installed or duplicate debug dependency delegated".into()));
    }
    Ok(())
}

fn manual_value(
    manual: &ManualPolicy,
    groups: &ManualGroups<'_>,
    all: &[&SourcedDep<'_>],
) -> Value {
    let mut added = Map::new();
    if !groups.runtime.is_empty() {
        added.insert("dependencies".into(), manual_versions(&groups.runtime));
    }
    if !groups.dev.is_empty() {
        added.insert("devDependencies".into(), manual_versions(&groups.dev));
    }
    if !groups.peer.is_empty() {
        added.insert("peerDependencies".into(), manual_versions(&groups.peer));
    }
    let mut runtime_missing = manual.unresolved_plus
        .iter()
        .map(String::as_str)
        .chain(groups.runtime.iter().map(|(name, _, _)| *name))
        .collect::<Vec<_>>();
    runtime_missing.sort_unstable();
    let missing = runtime_missing
        .into_iter()
        .chain(
            groups.dev
                .iter()
                .chain(&groups.peer)
                .map(|(name, _, _)| *name),
        )
        .collect::<Vec<_>>();
    let sources = all
        .iter()
        .map(|(name, _, source)| json!({ "id": name, "source": source }))
        .collect::<Vec<_>>();
    json!({
        "components": [],
        "manuallyRemovedDependencies": {},
        "manuallyAddedDependencies": added,
        "missingPackageDependencies": missing,
        "coreAspects": [],
        "sources": sources,
    })
}

fn manual_versions(deps: &[SourcedDep<'_>]) -> Value {
    Value::Array(
        deps.iter()
            .map(|(name, version, _)| Value::String(format!("{name}@{version}")))
            .collect(),
    )
}

fn versions(deps: &[(&str, &str)]) -> Value {
    Value::Array(
        deps.iter()
            .map(|(name, version)| Value::String(format!("{name}@{version}")))
            .collect(),
    )
}
