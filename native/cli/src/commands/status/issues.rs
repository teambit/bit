//! `collectRustStatusIssues` (`rust-status-issues.ts`): the issues status
//! adds to what dependency detection found, formatted as
//! `IssuesList.toObjectIncludeDataAsString()` formats them.

use super::js::{array, decline, nullish, text, truthy, without_version};
use serde_json::{Value, json};
use std::{
    collections::{HashMap, HashSet},
    io,
    path::{Path, PathBuf},
};

const RESOLVER: &str = "teambit.dependencies/dependency-resolver";
/// `ISSUE_FORMAT_SPACE`.
const SPACE: &str = "          ";

/// One captured component: its full identity and its detection results.
#[derive(Clone)]
pub struct Component {
    pub identity: String,
    pub package_name: String,
    pub dependencies: Vec<String>,
    pub issues: Value,
}

/// `None` where the Node.js glue returned `undefined`: a dependency outside
/// the workspace, or a model whose head is deprecated or removed.
pub fn collect(
    root: &Path,
    context: &Value,
    components: &[Component],
) -> io::Result<Option<Vec<Value>>> {
    let identities: HashSet<&str> = components
        .iter()
        .map(|component| component.identity.as_str())
        .collect();
    let external = components
        .iter()
        .any(|component| {
            component.dependencies
                .iter()
                .any(|id| !identities.contains(id.as_str()))
        });
    if external || !ordinary_model_heads(context)? {
        return Ok(None);
    }
    let resolver = nullish(
        context
            .get("workspace")
            .and_then(|workspace| workspace.get(RESOLVER)),
    );
    let checks = Checks {
        root,
        targets: array(context.get("targets"), "targets")?,
        packages: workspace_packages(context, resolver),
        root_components: truthy(resolver.and_then(|resolver| resolver.get("rootComponents"))),
        circular: cyclic(components),
    };
    components
        .iter()
        .map(|component| checks.issues(component))
        .collect::<io::Result<Vec<_>>>()
        .map(Some)
}

/// What the per-component checks share.
struct Checks<'c> {
    root: &'c Path,
    targets: &'c [Value],
    packages: HashSet<&'c str>,
    root_components: bool,
    circular: HashSet<&'c str>,
}

impl Checks<'_> {
    /// `{ id, issues }` of one component.
    fn issues(&self, component: &Component) -> io::Result<Value> {
        let identity = without_version(&component.identity);
        let target = self.targets
            .iter()
            .find(|row| row.get("identity").and_then(Value::as_str) == Some(identity))
            .ok_or_else(|| decline("status issue target missing"))?;
        let nested = text(target.get("directory"))? != ".";
        let mut issues = deserialize(&component.issues)?;
        let linked = self.root
            .join("node_modules")
            .join(&component.package_name)
            .exists();
        if nested && !linked {
            set(&mut issues, Issue::MissingLinks, json!(true));
        }
        let module = runtime_module_path(self.root, component, self.root_components);
        if !exists(&module.join("dist"))? {
            set(&mut issues, Issue::MissingDists, json!(true));
        }
        if nested && self.packages.contains(component.package_name.as_str()) {
            set(&mut issues, Issue::Duplicate, json!(component.package_name));
        }
        if self.circular.contains(component.identity.as_str()) {
            set(&mut issues, Issue::Circular, json!(true));
        }
        let issues = issues
            .iter()
            .map(|(kind, data)| kind.to_object(data))
            .collect::<io::Result<Vec<_>>>()?;
        Ok(json!({ "id": identity, "issues": issues }))
    }
}

/// `ordinaryModelHeads`: no deprecated model, no head that is deprecated or removed.
fn ordinary_model_heads(context: &Value) -> io::Result<bool> {
    let versions: HashMap<&str, &Value> = array(context.get("versions"), "versions")?
        .iter()
        .filter_map(|row| Some((row.get(0)?.as_str()?, row.get(1)?)))
        .collect();
    let models = array(context.get("models"), "models")?;
    Ok(models
        .iter()
        .all(|model| {
            if truthy(model.get("deprecated")) {
                return false;
            }
            let Some(head) = model
                .get("head")
                .filter(|head| truthy(Some(head)))
            else {
                return true;
            };
            let Some(version) = head
                .as_str()
                .and_then(|head| versions.get(head))
            else {
                return false;
            };
            let extensions = version.get("extensions").and_then(Value::as_array);
            !extensions.is_some_and(|extensions| {
                extensions
                    .iter()
                    .any(|extension| {
                        matches!(
                            extension.get("name").and_then(Value::as_str),
                            Some("teambit.component/deprecation" | "teambit.component/remove"),
                        )
                    })
            })
        }))
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

/// Components in a dependency cycle, self-dependencies included: the
/// members of strongly connected components larger than one node.
fn cyclic(components: &[Component]) -> HashSet<&str> {
    let index: HashMap<&str, usize> = components
        .iter()
        .enumerate()
        .map(|(position, component)| (component.identity.as_str(), position))
        .collect();
    let edges: Vec<Vec<usize>> = components
        .iter()
        .map(|component| {
            component.dependencies
                .iter()
                .filter_map(|id| index.get(id.as_str()).copied())
                .collect()
        })
        .collect();
    let mut tarjan = Tarjan::new(&edges);
    (0..components.len()).for_each(|node| tarjan.visit(node));
    tarjan.components
        .iter()
        .filter(|scc| scc.len() > 1 || edges[scc[0]].contains(&scc[0]))
        .flatten()
        .map(|&node| components[node].identity.as_str())
        .collect()
}

struct Tarjan<'e> {
    edges: &'e [Vec<usize>],
    index: Vec<Option<usize>>,
    low: Vec<usize>,
    on_stack: Vec<bool>,
    stack: Vec<usize>,
    next: usize,
    components: Vec<Vec<usize>>,
}

impl<'e> Tarjan<'e> {
    fn new(edges: &'e [Vec<usize>]) -> Self {
        let size = edges.len();
        Self {
            edges,
            index: vec![None; size],
            low: vec![0; size],
            on_stack: vec![false; size],
            stack: Vec::new(),
            next: 0,
            components: Vec::new(),
        }
    }

    /// Iterative, so deep dependency chains cannot overflow the stack.
    fn visit(&mut self, start: usize) {
        if self.index[start].is_some() {
            return;
        }
        let mut work = vec![(start, 0)];
        self.open(start);
        while let Some((node, edge)) = work.pop() {
            match self.edges[node].get(edge) {
                Some(&next) => {
                    work.push((node, edge + 1));
                    self.follow(node, next, &mut work);
                }
                None => self.finish(node, work.last().map(|&(parent, _)| parent)),
            }
        }
    }

    /// The edge `node -> next`: descend into an unvisited node, or lower
    /// `node`'s link through one still on the stack.
    fn follow(&mut self, node: usize, next: usize, work: &mut Vec<(usize, usize)>) {
        match self.index[next] {
            None => {
                self.open(next);
                work.push((next, 0));
            }
            Some(index) if self.on_stack[next] => self.low[node] = self.low[node].min(index),
            Some(_) => {}
        }
    }

    /// All of `node`'s edges are done: pass its link up, close its component.
    fn finish(&mut self, node: usize, parent: Option<usize>) {
        if let Some(parent) = parent {
            self.low[parent] = self.low[parent].min(self.low[node]);
        }
        if Some(self.low[node]) == self.index[node] {
            self.close(node);
        }
    }

    fn open(&mut self, node: usize) {
        self.index[node] = Some(self.next);
        self.low[node] = self.next;
        self.next += 1;
        self.stack.push(node);
        self.on_stack[node] = true;
    }

    fn close(&mut self, root: usize) {
        let mut component = Vec::new();
        while let Some(node) = self.stack.pop() {
            self.on_stack[node] = false;
            component.push(node);
            if node == root {
                break;
            }
        }
        self.components.push(component);
    }
}

/// `runtimeModulePath`: with root components, the component's own root (or
/// the Node environment's root) when it holds the package.
fn runtime_module_path(root: &Path, component: &Component, root_components: bool) -> PathBuf {
    let ordinary = root.join("node_modules").join(&component.package_name);
    if !root_components {
        return ordinary;
    }
    let roots = root.join("node_modules").join(".bit_roots");
    let own = roots.join(without_version(&component.identity).replace('/', "_"));
    let selected = if own.exists() { own } else { roots.join("teambit.harmony_node") };
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

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Issue {
    MissingManual,
    MissingPackages,
    MissingLinks,
    MissingDists,
    Duplicate,
    Circular,
}

impl Issue {
    fn parse(name: &str) -> io::Result<Self> {
        Ok(match name {
            "MissingManuallyConfiguredPackages" => Self::MissingManual,
            "MissingPackagesDependenciesOnFs" => Self::MissingPackages,
            "MissingLinksFromNodeModulesToSrc" => Self::MissingLinks,
            "MissingDists" => Self::MissingDists,
            "DuplicateComponentAndPackage" => Self::Duplicate,
            "CircularDependencies" => Self::Circular,
            _ => return Err(decline(format!("status issue type {name}"))),
        })
    }

    /// `type`, `description`, `solution` and `isTagBlocker` of the issue class.
    const fn class(self) -> (&'static str, &'static str, &'static str, bool) {
        match self {
            Self::MissingManual => (
                "MissingManuallyConfiguredPackages",
                "missing packages that were manually set",
                r#"run "bit install""#,
                true,
            ),
            Self::MissingPackages => (
                "MissingPackagesDependenciesOnFs",
                "missing packages or links from node_modules to the source",
                r#"run "bit install --add-missing-deps" to fix both issues"#,
                true,
            ),
            Self::MissingLinks => (
                "MissingLinksFromNodeModulesToSrc",
                "missing links from node_modules to source",
                r#"run "bit link""#,
                false,
            ),
            Self::MissingDists => ("MissingDists", "missing dists", r#"run "bit compile""#, false),
            Self::Duplicate => (
                "DuplicateComponentAndPackage",
                "tracked component added as a package",
                "either remove the package from the workspace.jsonc (bit uninstall) or remove the component (bit remove)",
                true,
            ),
            Self::Circular => (
                "CircularDependencies",
                "circular dependencies",
                "run `bit deps circular` to get the component-ids participating in the circular",
                true,
            ),
        }
    }

    /// `issue.toObject()` plus `dataAsString`.
    fn to_object(self, data: &Value) -> io::Result<Value> {
        let (kind, description, solution, blocker) = self.class();
        let text = self.data_to_string(data)?;
        if text.contains('\u{1b}') {
            return Err(decline("status issue data with escape sequences"));
        }
        Ok(json!({
            "type": kind,
            "description": description,
            "solution": solution,
            "isTagBlocker": blocker,
            "data": data,
            "dataAsString": text,
        }))
    }

    /// `issue.dataToString()`.
    fn data_to_string(self, data: &Value) -> io::Result<String> {
        match self {
            Self::MissingManual => Ok(format!("{SPACE}{}", join(data)?)),
            Self::Duplicate => Ok(format!("{SPACE}{}", text(Some(data))?)),
            Self::MissingPackages => {
                let rows = array(Some(data), "missing packages")?
                    .iter()
                    .map(|row| {
                        let file = text(row.get("filePath"))?;
                        let packages = row
                            .get("missingPackages")
                            .ok_or_else(|| decline("missing packages"))?;
                        Ok(format!("{SPACE}{file} -> {}", list_or_text(packages)?))
                    });
                Ok(rows.collect::<io::Result<Vec<_>>>()?.join("\n"))
            }
            // `Object.keys(true)` is empty.
            Self::MissingLinks | Self::MissingDists | Self::Circular => match data {
                Value::Bool(_) => Ok(String::new()),
                _ => Err(decline("status issue data")),
            },
        }
    }
}

/// `array.join(', ')` of strings.
fn join(data: &Value) -> io::Result<String> {
    let items = array(Some(data), "issue data")?;
    let items = items
        .iter()
        .map(|item| text(Some(item)))
        .collect::<io::Result<Vec<_>>>()?;
    Ok(items.join(", "))
}

/// `componentIssueToString`: arrays joined, strings as they are.
fn list_or_text(value: &Value) -> io::Result<String> {
    match value {
        Value::String(text) => Ok(text.clone()),
        _ => join(value),
    }
}

/// `IssuesList.deserialize`: `[{ type, data: JSON string }]`.
fn deserialize(value: &Value) -> io::Result<Vec<(Issue, Value)>> {
    let Some(rows) = value.as_array() else { return Ok(Vec::new()) };
    rows.iter()
        .map(|row| {
            let kind = Issue::parse(text(row.get("type"))?)?;
            let data = serde_json::from_str(text(row.get("data"))?).map_err(io::Error::other)?;
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
