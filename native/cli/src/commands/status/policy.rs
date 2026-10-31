//! The dependency policy inputs of one component and its status metadata,
//! with the environment and component `VariantPolicy` precedence used by
//! the dependency resolver. Pending-configuration projections decline.

pub use metadata::{current_metadata, peer_metadata};
pub(super) use pending::context as pending_context;

mod component;
mod extensions;
mod metadata;
mod model;
mod names;
mod pending;
mod projection;
mod workspace;

use super::{
    grammar,
    js::{array, assign, decline, full_identity, nullish, string_map, text},
};
use model::{dependencies, model_of, stored_version, validate_harmony_version};
use names::{default_prefix, package_name};
use serde_json::{Map, Value, json};
use std::io;
use workspace::{Workspace, read as workspace};

const RESOLVER: &str = "teambit.dependencies/dependency-resolver";
const FIELDS: [&str; 3] = ["dependencies", "devDependencies", "peerDependencies"];
const PACKAGE_FIELDS: [&str; 3] =
    ["packageDependencies", "devPackageDependencies", "peerPackageDependencies"];

/// `getNodeDependencyPolicy()` of `@teambit/node`.
const NODE_DEV_DEPENDENCIES: [(&str, &str); 2] =
    [("@types/jest", "26.0.20"), ("@types/node", "22.10.5")];
const NODE_PEERS: [(&str, &str); 2] =
    [("react", "^17.0.0 || ^18.0.0 || ^19.0.0"), ("react-dom", "^17.0.0 || ^18.0.0 || ^19.0.0")];

pub struct Policy {
    /// `policy.input`: spread into the engine's dependency requests.
    pub input: Value,
    pub extensions: Vec<Value>,
    /// The stored version's package dependencies per lifecycle.
    pub model_packages: [Map<String, Value>; 3],
    pub overrides: Value,
    pub binding_prefix: String,
    pub package_name: String,
    pub merge_conflict: bool,
}

impl Policy {
    pub fn ignored_issues(&self) -> io::Result<Vec<String>> {
        let config = self.extensions
            .iter()
            .find(|entry| component::matches_aspect(entry, "teambit.component/issues"));
        array(
            config.and_then(|entry| entry["config"].get("ignoreIssues")),
            "component ignoreIssues",
        )?
        .iter()
        .map(|value| text(Some(value)).map(str::to_string))
        .collect()
    }

    pub fn issues(&self, dependencies: &Value) -> io::Result<Value> {
        let mut issues = array(dependencies.get("issues"), "dependency issues")?.to_vec();
        issues.retain(|issue| issue["type"] != "PinnedDependencies");
        if self.merge_conflict {
            issues.push(json!({"type":"MergeConfigHasConflict","data":"true"}));
        }
        let pinned = self.pinned_dependencies(dependencies)?;
        if !pinned.is_empty() {
            let data = serde_json::to_string(&pinned).map_err(io::Error::other)?;
            issues.push(json!({"type":"PinnedDependencies","data":data}));
        }
        Ok(json!(issues))
    }

    fn workspace_base_ids(&self) -> io::Result<std::collections::HashSet<&str>> {
        Ok(array(self.input["resolution"]["sources"].get("bitmap"), "bitmap sources")?
            .iter()
            .filter_map(Value::as_str)
            .map(|id| {
                id.rfind('@')
                    .map_or(id, |sep| &id[..sep])
            })
            .collect())
    }

    fn pinned_dependencies(&self, dependencies: &Value) -> io::Result<Vec<String>> {
        let workspace_ids = self.workspace_base_ids()?;
        let state = &dependencies["state"];
        let entries = array(state.get("entries"), "dependency entries")?;
        let mut pinned = Vec::new();
        for indices in array(state.get("components"), "dependency lifecycles")? {
            for index in array(Some(indices), "dependency indices")? {
                let entry = index
                    .as_u64()
                    .and_then(|index| entries.get(index as usize))
                    .ok_or_else(|| decline("status dependency entry"))?;
                if entry.get("versionFromConfig") != Some(&Value::Bool(true)) {
                    continue;
                }
                let identity = text(entry.get("identity"))?;
                let (base_id, version) = identity
                    .rsplit_once('@')
                    .unwrap_or((identity, ""));
                if !workspace_ids.contains(base_id) {
                    continue;
                }
                let package = entry
                    .get("packageName")
                    .and_then(Value::as_str)
                    .filter(|pkg| !pkg.is_empty())
                    .unwrap_or(base_id);
                pinned.push(format!("{package}@{version}"));
            }
        }
        Ok(pinned)
    }
}

/// `statusPolicy(context, target)`.
pub fn status_policy(context: &Value, target: &Value) -> io::Result<Policy> {
    projected_policy(context, target, None)
}

/// `statusPolicy(context, target, projectedVersion)`: with a projected
/// version (a merge's incoming or fast-forwarded version) in place of the
/// stored one.
pub fn projected_policy(
    context: &Value,
    target: &Value,
    projected: Option<&Value>,
) -> io::Result<Policy> {
    if target.get("recoveryConfig").is_some() {
        return Err(decline("status projected configuration"));
    }
    let identity = text(target.get("identity"))?;
    let model = model_of(context, identity);
    let version =
        stored_version(context, target, model, projected.filter(|version| !version.is_null()))?;
    validate_harmony_version(version)?;
    let mut effective = target.clone();
    effective["projectedExtensions"] = json!(projection::extensions(context, target, version)?);
    let extensions = extensions::status_extensions(&effective)?;
    let merged = component::Policy::read(context, target, &extensions)?;
    let overrides = merged.overrides();
    let workspace = workspace(context)?;
    let input = Sources {
        context,
        target,
        version,
        policy: &merged,
        extensions: &extensions,
        workspace: &workspace,
    }
    .input()?;
    let (binding_prefix, package_name) = names(identity, model, &extensions);
    Ok(Policy {
        input,
        extensions,
        model_packages: model_packages(version)?,
        overrides,
        binding_prefix,
        package_name,
        merge_conflict: context["pendingConfigurations"][identity]["conflict"] == true,
    })
}

/// Effective aspects for environment callbacks, using the same native merge as status.
pub(in crate::commands) fn environment_target(
    context: &Value,
    target: &Value,
) -> io::Result<Value> {
    let model = model_of(context, text(target.get("identity"))?);
    let version =
        if model.is_some() { stored_version(context, target, model, None)? } else { None };
    let rows = projection::extensions(context, target, version)?;
    let environment = rows
        .iter()
        .find(|row| component::matches_aspect(row, "teambit.envs/envs"))
        .and_then(|row| row["config"]["env"].as_str())
        .map(str::to_string);
    let mut config = Map::new();
    for row in rows {
        let name = row
            .get("name")
            .and_then(Value::as_str)
            .map_or_else(|| extension_identity(&row["extensionId"]), str::to_string);
        config.insert(name, row["config"].clone());
    }
    if let Some(environment) = environment {
        config
            .entry("teambit.envs/envs")
            .or_insert_with(|| json!({}))["env"] = json!(environment);
    }
    let mut effective = target.clone();
    effective["config"] = json!({"extensions":config,"propagate":true});
    effective
        .as_object_mut()
        .ok_or_else(|| decline("status target"))?
        .remove("componentConfig");
    Ok(effective)
}

fn extension_identity(id: &Value) -> String {
    let version = id["version"]
        .as_str()
        .filter(|version| !version.is_empty() && *version != "latest")
        .map_or_else(String::new, |version| format!("@{version}"));
    format!(
        "{}/{}{version}",
        id["scope"].as_str().unwrap_or_default(),
        id["name"].as_str().unwrap_or_default(),
    )
}

/// `bindingPrefix` and the package name, from the stored prefix when there is one.
fn names(identity: &str, model: Option<&Value>, extensions: &[Value]) -> (String, String) {
    let stored = model
        .and_then(|model| model.get("bindingPrefix"))
        .and_then(Value::as_str)
        .filter(|prefix| !prefix.is_empty());
    let prefix = stored.map_or_else(|| default_prefix(identity), str::to_string);
    (prefix, configured_package_name(identity, stored, extensions))
}

fn configured_package_name(identity: &str, prefix: Option<&str>, extensions: &[Value]) -> String {
    let Some(pkg) =
        extensions.iter().find(|entry| component::matches_aspect(entry, "teambit.pkg/pkg"))
    else {
        return package_name(identity, prefix);
    };
    let (scope, name) = identity
        .split_once('/')
        .unwrap_or(("", identity));
    let id = bit_install::model::ComponentId {
        scope: Some(scope.to_string()),
        default_scope: None,
        name: name.to_string(),
        version: None,
    };
    let mut aspects = Map::new();
    aspects.insert("teambit.pkg/pkg".to_string(), pkg["config"].clone());
    bit_install::workspace::component_package_name(&id, prefix, &aspects)
}

/// The stored version's package dependencies per lifecycle.
fn model_packages(version: Option<&Value>) -> io::Result<[Map<String, Value>; 3]> {
    let field = |name: &str| string_map(version.and_then(|stored| stored.get(name)));
    Ok([field(PACKAGE_FIELDS[0])?, field(PACKAGE_FIELDS[1])?, field(PACKAGE_FIELDS[2])?])
}

/// What `policy.input` is computed from.
struct Sources<'s> {
    context: &'s Value,
    target: &'s Value,
    version: Option<&'s Value>,
    policy: &'s component::Policy,
    extensions: &'s [Value],
    workspace: &'s Workspace,
}

impl Sources<'_> {
    /// `policy.input` with its `resolution.grammar`.
    fn input(&self) -> io::Result<Value> {
        let mut merge = merge_policy(self.target)?;
        let identity = text(self.target.get("identity"))?;
        if let Some(auto) = self.context["pendingConfigurations"][identity].get("auto") {
            for (field, additions) in merge
                .iter_mut()
                .zip(component::automatic(auto)?)
            {
                assign(field, &additions);
            }
        }
        let mut input = json!({
            "policies": self.policies(&merge)?,
            "finish": self.finish()?,
            "resolution": self.resolution(&merge)?,
        });
        input["resolution"]["grammar"] = grammar::dependency(&input);
        Ok(input)
    }

    fn field(&self, name: &str) -> io::Result<Map<String, Value>> {
        string_map(self.version.and_then(|stored| stored.get(name)))
    }

    fn policies(&self, merge: &[Map<String, Value>; 3]) -> io::Result<Value> {
        let mut automatic = self.policy.automatic.clone();
        for (policy, merge) in automatic.iter_mut().zip(merge) {
            assign(policy, merge);
        }
        Ok(json!({
            "modelPeers": self.field("peerPackageDependencies")?,
            "packagePolicy": {
                "dependencies": self.workspace.package_json[0],
                "peerDependencies": self.workspace.package_json[2],
            },
            "workspacePolicy": self.workspace.policy,
            "automatic": automatic,
        }))
    }

    fn finish(&self) -> io::Result<Value> {
        Ok(json!({
            "manual": self.policy.manual,
            "packageJson": self.workspace.package_json,
            "selfIdentity": full_identity(self.target)?,
            "environment": {
                "policy": self.policy.env_own,
                "workspace": self.workspace.policy,
                "modelComponents": model_components(self.version)?,
                "modelPackages": self.field("packageDependencies")?,
            },
        }))
    }

    fn resolution(&self, merge: &[Map<String, Value>; 3]) -> io::Result<Value> {
        let extensions =
            array(self.version.and_then(|stored| stored.get("extensions")), "extensions")?;
        let resolver_data = extensions
            .iter()
            .find(|extension| extension.get("name").and_then(Value::as_str) == Some(RESOLVER))
            .and_then(|extension| extension.get("data"));
        let prefix = nullish(resolver_data.and_then(|data| data.get("componentRangePrefix")));
        Ok(json!({
            "sources": {
                "bitmap": bitmap_identities(self.context)?,
                "lane": [],
                "model": model_dependencies(self.version)?,
                "componentConfig": {},
            },
            "extensions": self.extensions.iter().filter_map(|extension| extension.get("extensionId")).map(extension_identity).collect::<Vec<_>>(),
            "grammar": {},
            "prefix": prefix,
            "merge": merge,
        }))
    }
}

/// `target.autoDetectMergePolicy ?? [{}, {}, {}]`.
fn merge_policy(target: &Value) -> io::Result<[Map<String, Value>; 3]> {
    let Some(value) = nullish(target.get("autoDetectMergePolicy")) else {
        return Ok([Map::new(), Map::new(), Map::new()]);
    };
    match value.as_array().map(Vec::as_slice) {
        Some([a, b, c]) => Ok([string_map(Some(a))?, string_map(Some(b))?, string_map(Some(c))?]),
        _ => Err(decline("command automatic merge policy")),
    }
}

fn model_components(version: Option<&Value>) -> io::Result<Vec<Value>> {
    array(version.and_then(|stored| stored.get("dependencies")), "dependencies")?
        .iter()
        .map(|dependency| {
            let field = |name| nullish(dependency.get(name)).cloned().unwrap_or(Value::Null);
            Ok(json!({
                "identity": identity(dependency.get("id"))?,
                "packageName": field("packageName"),
                "versionRange": field("versionRange"),
            }))
        })
        .collect()
}

fn model_dependencies(version: Option<&Value>) -> io::Result<Vec<String>> {
    dependencies(version)?
        .into_iter()
        .map(|dependency| identity(dependency.get("id")))
        .collect()
}

fn bitmap_identities(context: &Value) -> io::Result<Vec<String>> {
    array(context.get("targets"), "targets")?
        .iter()
        .map(full_identity)
        .collect()
}

/// `identity(value)`: `scope/name@version` of a stored component id.
fn identity(value: Option<&Value>) -> io::Result<String> {
    let id = value.ok_or_else(|| decline("status dependency id"))?;
    if let Some(text) = id.as_str() {
        return Ok(text.to_string());
    }
    let part = |key| text(id.get(key));
    let version = match nullish(id.get("version")) {
        None => "",
        Some(Value::String(version)) if version.is_empty() || version == "latest" => "",
        Some(Value::String(version)) => version,
        Some(_) => return Err(decline("status dependency version")),
    };
    let suffix = if version.is_empty() { String::new() } else { format!("@{version}") };
    Ok(format!("{}/{}{suffix}", part("scope")?, part("name")?))
}

#[cfg(test)]
mod policy_tests;

/// Merge captured configuration for native export package transformers.
pub(in crate::commands) fn export_package_config(
    context: &Value,
    target: &Value,
    version: &Value,
) -> io::Result<Map<String, Value>> {
    let rows = projection::extensions(context, target, Some(version))?;
    Ok(bit_install::workspace::aspects::from_model(&rows)
        .into_iter()
        .map(|entry| (entry.id, entry.config))
        .collect())
}
