//! The issues status adds to what dependency detection found, formatted as
//! `IssuesList.toObjectIncludeDataAsString()` formats them.

mod callbacks;
mod cycles;
mod deprecated;
mod detected;
mod format;
mod kinds;
mod removed;
mod resolve;
#[cfg(test)]
mod tests;

use super::js::{array, decline, nullish, text, truthy, without_version};
use serde_json::{Value, json};
use std::{
    collections::HashSet,
    io,
    path::{Path, PathBuf},
};

use cycles::cyclic;
use kinds::Issue;

const RESOLVER: &str = "teambit.dependencies/dependency-resolver";
const ISSUES: &str = "teambit.component/issues";
/// `ISSUE_FORMAT_SPACE`.
const SPACE: &str = "          ";

/// One captured component: its full identity and its detection results.
#[derive(Clone)]
pub struct Component {
    /// Per-component `IssuesMain` settings from the fully merged aspect config.
    pub ignored: Vec<String>,
    pub identity: String,
    pub package_name: String,
    pub dependencies: Vec<String>,
    pub issues: Value,
}

/// Validate a public component-issue class name against the released native catalog.
pub(in crate::commands) fn validate_name(name: &str) -> io::Result<()> {
    Issue::parse(name).map(|_| ())
}

/// `None` where the native status declines: a dependency outside
/// the workspace, or a model whose head is deprecated.
pub fn collect(
    root: &Path,
    context: &Value,
    components: &[Component],
) -> io::Result<Option<Vec<Value>>> {
    if !ordinary_model_heads(context)? {
        return Ok(None);
    }
    collect_graph(root, context, components, components)
}

/// The status issues with the resolved issue heads: the dependencies
/// outside the workspace are the engine's external vertices (`issueGraph`),
/// and the models' heads are the engine's proofs.
pub fn collect_resolved(
    root: &Path,
    context: &Value,
    components: &[Component],
    heads: &Value,
    issue_graph: Option<&Value>,
) -> io::Result<Option<Vec<Value>>> {
    let Some(external) = resolve::external_vertices(components, issue_graph) else {
        return Ok(None);
    };
    let graph: Vec<Component> = components
        .iter()
        .cloned()
        .chain(external)
        .collect();
    if !resolve::ordinary_heads_for(context, heads, Some(&graph)) {
        return Ok(None);
    }
    collect_graph(root, context, components, &graph)
}

/// The issues of `components`, whose dependencies are all in `graph`.
pub(super) fn collect_graph(
    root: &Path,
    context: &Value,
    components: &[Component],
    graph: &[Component],
) -> io::Result<Option<Vec<Value>>> {
    let identities: HashSet<&str> = graph
        .iter()
        .map(|component| component.identity.as_str())
        .collect();
    let outside = components
        .iter()
        .any(|component| {
            component.dependencies
                .iter()
                .any(|id| !identities.contains(id.as_str()))
        });
    if outside {
        return Ok(None);
    }
    let resolver = nullish(
        context
            .get("workspace")
            .and_then(|workspace| workspace.get(RESOLVER)),
    );
    let filtered_graph = filter_graph_for_cycles(root, components, graph);
    let circular = if context["ignoreCircularDependencies"] == true {
        HashSet::new()
    } else {
        cyclic(&filtered_graph)
    };
    let checks = Checks {
        root,
        context,
        targets: array(context.get("targets"), "targets")?,
        packages: workspace_packages(context, resolver),
        root_components: truthy(resolver.and_then(|resolver| resolver.get("rootComponents"))),
        circular,
        ignored: ignored(context)?,
    };
    components
        .iter()
        .map(|component| checks.issues(component))
        .collect::<io::Result<Vec<_>>>()
        .map(Some)
}

fn filter_graph_for_cycles(
    root: &Path,
    components: &[Component],
    graph: &[Component],
) -> Vec<Component> {
    let workspace_ids: HashSet<&str> = components
        .iter()
        .map(|component| component.identity.as_str())
        .collect();
    let unresolved: HashSet<&str> = components
        .iter()
        .filter(|component| has_unresolved_deps(root, component))
        .map(|component| component.identity.as_str())
        .collect();
    graph
        .iter()
        .map(|component| {
            if workspace_ids.contains(component.identity.as_str()) {
                return component.clone();
            }
            let mut ext = component.clone();
            ext.dependencies.retain(|dep| {
                !workspace_ids.contains(dep.as_str()) || unresolved.contains(dep.as_str())
            });
            ext
        })
        .collect()
}

/// What the per-component checks share.
struct Checks<'c> {
    root: &'c Path,
    context: &'c Value,
    targets: &'c [Value],
    packages: HashSet<&'c str>,
    root_components: bool,
    circular: HashSet<&'c str>,
    /// The issue types `removeIgnoredIssuesFromComponents` removes.
    ignored: HashSet<&'c str>,
}

impl Checks<'_> {
    /// `{ id, issues }` of one component.
    fn missing_dists(&self, component: &Component, target: &Value) -> io::Result<bool> {
        let projected = super::policy::environment_target(self.context, target)?;
        let env = crate::commands::update_cmd::aspect_entry(
            &projected["config"]["extensions"],
            "teambit.envs/envs",
        )
        .and_then(|(_, val)| val["env"].as_str())
        .map(str::trim)
        .filter(|env| !env.is_empty())
        .unwrap_or("teambit.harmony/node");
        let module = runtime_module_path(self.root, component, self.root_components, env);
        let compiler =
            &self.context["environmentFacts"][without_version(&component.identity)]["compiler"];
        let dist = compiler["distDir"]
            .as_str()
            .map(str::trim)
            .filter(|dir| !dir.is_empty())
            .unwrap_or("dist");
        Ok(compiler["hasCompiler"] != false && !exists(&module.join(dist))?)
    }

    fn issues(&self, component: &Component) -> io::Result<Value> {
        let identity = without_version(&component.identity);
        let target = self.targets
            .iter()
            .find(|row| row.get("identity").and_then(Value::as_str) == Some(identity))
            .ok_or_else(|| decline("status issue target missing"))?;
        let nested = text(target.get("directory"))? != ".";
        let mut ignored = self.ignored.clone();
        for name in &component.ignored {
            Issue::parse(name)?;
            ignored.insert(name.as_str());
        }
        let mut issues = deserialize(&component.issues, &ignored)?;
        let linked = self.root
            .join("node_modules")
            .join(&component.package_name)
            .exists();
        if nested && !linked {
            set(&mut issues, Issue::MissingLinks, json!(true));
        }
        if self.missing_dists(component, target)? {
            set(&mut issues, Issue::MissingDists, json!(true));
        }
        if nested && self.packages.contains(component.package_name.as_str()) {
            set(&mut issues, Issue::Duplicate, json!(component.package_name));
        }
        if self.circular.contains(component.identity.as_str()) {
            set(&mut issues, Issue::Circular, json!(true));
        }
        let removed = self.removed_dependencies(component, &issues)?;
        if !removed.is_empty() {
            set(&mut issues, Issue::RemovedDependencies, json!(removed));
        }
        let deprecated = self.deprecated_dependencies(component)?;
        if !deprecated.is_empty() {
            set(&mut issues, Issue::DeprecatedDependencies, json!(deprecated));
        }
        issue_object(identity, &issues, &ignored, component)
    }
}

fn issue_object(
    identity: &str,
    issues: &[(Issue, Value)],
    ignored: &HashSet<&str>,
    component: &Component,
) -> io::Result<Value> {
    let mut objects = issues
        .iter()
        .filter(|(kind, _)| !ignored.contains(kind.class().0))
        .map(|(kind, data)| kind.to_object(data))
        .collect::<io::Result<Vec<_>>>()?;
    callbacks::merge(&mut objects, &component.issues, ignored)?;
    Ok(json!({ "id": identity, "issues": objects }))
}

/// `getIssuesToIgnoreGlobally`: `ignoreIssues` of `teambit.component/issues` in the
/// `workspace.jsonc` the context carries, which the engine validated.
fn ignored(context: &Value) -> io::Result<HashSet<&str>> {
    let workspace = context
        .get("workspace")
        .ok_or_else(|| decline("status issues without the workspace configuration"))?;
    let Some(names) = crate::commands::update_cmd::aspect_entry(workspace, ISSUES)
        .and_then(|(_, issues)| issues.get("ignoreIssues"))
    else {
        return Ok(HashSet::new());
    };
    array(Some(names), "ignoreIssues")?
        .iter()
        .map(|name| text(Some(name)).map(str::trim))
        .collect()
}

/// Model head metadata was captured and verified by the Rust repository reader.
pub(super) fn ordinary_model_heads(context: &Value) -> io::Result<bool> {
    array(context.get("models"), "models")?;
    array(context.get("versions"), "versions")?;
    Ok(true)
}

/// Package names the workspace policy and root `package.json` declare.
fn workspace_packages<'c>(context: &'c Value, resolver: Option<&'c Value>) -> HashSet<&'c str> {
    let keys = |object: Option<&'c Value>, fields: &[&str]| -> Vec<&'c str> {
        fields
            .iter()
            .filter_map(|field| {
                object
                    .and_then(|o| o.get(*field))
                    .and_then(Value::as_object)
            })
            .flat_map(|map| map.keys().map(String::as_str))
            .collect()
    };
    let policy = nullish(resolver.and_then(|r| r.get("policy")));
    let package_json = nullish(context.get("packageJson"));
    let mut packages: HashSet<&str> =
        keys(policy, &["dependencies", "peerDependencies"]).into_iter().collect();
    packages.extend(keys(package_json, &["dependencies", "devDependencies", "peerDependencies"]));
    packages
}

/// `runtimeModulePath`: with root components, the component's own root (or
/// the Node environment's root) when it holds the package.
fn runtime_module_path(
    root: &Path,
    component: &Component,
    root_components: bool,
    env: &str,
) -> PathBuf {
    let ordinary = root.join("node_modules").join(&component.package_name);
    if !root_components {
        return ordinary;
    }
    let roots = root.join("node_modules").join(".bit_roots");
    let own = roots.join(without_version(&component.identity).replace('/', "_"));
    let selected =
        if own.exists() { own } else { roots.join(without_version(env).replace('/', "_")) };
    let inner = selected.join("node_modules").join(&component.package_name);
    if inner.exists() { inner } else { ordinary }
}

/// `fs.promises.access`: missing paths are `false`, other errors decline.
fn exists(path: &Path) -> io::Result<bool> {
    match path.metadata() {
        Ok(_) => Ok(true),
        Err(error)
            if matches!(error.kind(), io::ErrorKind::NotFound | io::ErrorKind::NotADirectory) =>
        {
            Ok(false)
        }
        Err(error) => Err(error),
    }
}

/// `IssuesList.deserialize`: `[{ type, data: JSON string }]`, without the
/// `ignored` types.
fn deserialize(value: &Value, ignored: &HashSet<&str>) -> io::Result<Vec<(Issue, Value)>> {
    let Some(rows) = value.as_array() else { return Ok(Vec::new()) };
    rows.iter()
        .filter(|row| row.get("callbackObject").is_none())
        .filter(|row| {
            !row.get("type")
                .and_then(Value::as_str)
                .is_some_and(|kind| ignored.contains(kind))
        })
        .map(|row| {
            let kind = Issue::parse(text(row.get("type"))?)?;
            let data = serde_json::from_str(text(row.get("data"))?).map_err(io::Error::other)?;
            let data = match kind {
                Issue::Detected(kind) => kind.deserialize(data)?,
                _ => data,
            };
            Ok((kind, data))
        })
        .collect()
}

/// `issues.getOrCreate(Class).data = data`.
fn set(issues: &mut Vec<(Issue, Value)>, kind: Issue, data: Value) {
    match issues
        .iter_mut()
        .find(|(known, _)| *known == kind)
    {
        Some((_, existing)) => *existing = data,
        None => issues.push((kind, data)),
    }
}

fn has_unresolved_deps(root: &Path, component: &Component) -> bool {
    if !component.package_name.is_empty()
        && !root
            .join("node_modules")
            .join(&component.package_name)
            .exists()
    {
        return true;
    }
    component.issues
        .as_array()
        .is_some_and(|rows| {
            rows.iter()
                .any(|row| {
                    matches!(
                        row["type"].as_str(),
                        Some(
                            "MissingPackagesDependenciesOnFs"
                                | "MissingDependenciesOnFs"
                                | "UntrackedDependencies"
                                | "ParseErrors"
                                | "ResolveErrors",
                        ),
                    )
                })
        })
}
