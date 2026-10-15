//! The dependency policy inputs of one component and its status metadata,
//! for components on the built-in Node environment. Component-level
//! dependency policies, which need the `EnvPolicy`/`VariantPolicy` merge, and
//! every pending-configuration projection decline.

pub use metadata::current_metadata;

mod extensions;
mod metadata;

use super::{
    grammar,
    js::{array, assign, decline, full_identity, nullish, object, string_map, text, truthy},
};
use serde_json::{Map, Value, json};
use std::io;

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
    if extensions::pending_merge_config(target) || target.get("recoveryConfig").is_some() {
        return Err(decline("status projected configuration"));
    }
    let identity = text(target.get("identity"))?;
    let model = model_of(context, identity);
    let version =
        stored_version(context, target, model, projected.filter(|version| !version.is_null()))?;
    validate_harmony_version(version)?;
    let extensions = extensions::status_extensions(version, target)?;
    reject_component_policy(&extensions)?;
    let manual = node_manual();
    let overrides = json!({ "devDependencies": manual[1] });
    let workspace = workspace(context)?;
    let input =
        Sources { context, target, version, manual: &manual, workspace: &workspace }.input()?;
    let (binding_prefix, package_name) = names(identity, model);
    Ok(Policy {
        input,
        extensions,
        model_packages: model_packages(version)?,
        overrides,
        binding_prefix,
        package_name,
    })
}

/// `bindingPrefix` and the package name, from the stored prefix when there is one.
fn names(identity: &str, model: Option<&Value>) -> (String, String) {
    let stored = model
        .and_then(|model| model.get("bindingPrefix"))
        .and_then(Value::as_str)
        .filter(|prefix| !prefix.is_empty());
    let prefix = stored.map_or_else(|| default_prefix(identity), str::to_string);
    (prefix, package_name(identity, stored))
}

/// The stored version's package dependencies per lifecycle.
fn model_packages(version: Option<&Value>) -> io::Result<[Map<String, Value>; 3]> {
    let field = |name: &str| string_map(version.and_then(|stored| stored.get(name)));
    Ok([field(PACKAGE_FIELDS[0])?, field(PACKAGE_FIELDS[1])?, field(PACKAGE_FIELDS[2])?])
}

fn model_of<'c>(context: &'c Value, identity: &str) -> Option<&'c Value> {
    let models = context.get("models").and_then(Value::as_array)?;
    models
        .iter()
        .find(|model| {
            let part = |key| {
                model
                    .get(key)
                    .and_then(Value::as_str)
                    .unwrap_or("undefined")
            };
            format!("{}/{}", part("scope"), part("name")) == identity
        })
}

/// The stored `Version` object the target's bitmap version refers to.
fn stored_version<'c>(
    context: &'c Value,
    target: &Value,
    model: Option<&'c Value>,
    projected: Option<&'c Value>,
) -> io::Result<Option<&'c Value>> {
    let tagged = target
        .get("version")
        .and_then(Value::as_str)
        .filter(|value| !value.is_empty());
    match (tagged, model) {
        (Some(_), None) => return Err(decline("status pending import")),
        (None, Some(_)) => return Err(decline("status bitmap normalization required")),
        (None, None) => return Ok(projected),
        (Some(_), Some(_)) => {}
    }
    if projected.is_some() {
        return Ok(projected);
    }
    let tag = tagged.unwrap_or_default();
    let reference = if is_hash(tag) {
        Some(Value::String(tag.to_string()))
    } else {
        let lookup = |field: &str| {
            nullish(
                model
                    .and_then(|m| m.get(field))
                    .and_then(|m| m.get(tag)),
            )
        };
        lookup("orphanedVersions").or_else(|| lookup("versions")).cloned()
    };
    let versions = array(context.get("versions"), "versions")?;
    let version = versions
        .iter()
        .find(|row| {
            reference
                .as_ref()
                .is_some_and(|reference| row.get(0) == Some(reference))
        })
        .and_then(|row| nullish(row.get(1)));
    version.map(Some).ok_or_else(|| decline("status version absent"))
}

fn is_hash(text: &str) -> bool {
    text.len() == 40 && text.bytes().all(|b| b.is_ascii_hexdigit())
}

/// `validateHarmonyVersion`.
fn validate_harmony_version(version: Option<&Value>) -> io::Result<()> {
    let Some(version) = version else { return Ok(()) };
    if !matches!(version.get("schema").and_then(Value::as_str), Some("1.0.0" | "2.0.0")) {
        return Err(decline("status legacy component"));
    }
    for dependency in dependencies(Some(version))? {
        let id = dependency.get("id");
        let part = |key| {
            id.and_then(|id| id.get(key))
                .and_then(Value::as_str)
                .filter(|value| !value.is_empty())
        };
        if !truthy(id) || part("scope").is_none() || part("name").is_none() {
            return Err(decline("status unscoped dependency"));
        }
        let paths = dependency.get("relativePaths").and_then(Value::as_array);
        if paths.is_none_or(|paths| !paths.is_empty()) {
            return Err(decline("status relative dependency paths"));
        }
    }
    Ok(())
}

/// `[...(version?.dependencies ?? []), ...(version?.devDependencies ?? [])]`.
fn dependencies(version: Option<&Value>) -> io::Result<Vec<&Value>> {
    let field = |name| array(version.and_then(|stored| stored.get(name)), name);
    Ok(field("dependencies")?
        .iter()
        .chain(field("devDependencies")?)
        .collect())
}

/// A non-empty component policy needs the canonical `VariantPolicy` merge.
fn reject_component_policy(extensions: &[Value]) -> io::Result<()> {
    let resolver = extensions
        .iter()
        .find(|extension| extension["name"] == RESOLVER);
    let Some(policy) = nullish(resolver.and_then(|extension| extension["config"].get("policy")))
    else {
        return Ok(());
    };
    let policy = object(policy)?;
    if policy
        .keys()
        .any(|key| !FIELDS.contains(&key.as_str()))
    {
        return Err(decline("status component policy"));
    }
    if !policy.is_empty() {
        return Err(decline("status component policy requires the canonical merge"));
    }
    Ok(())
}

/// The Node environment's forced (`manual`) policy per lifecycle.
fn node_manual() -> [Map<String, Value>; 3] {
    let dev = NODE_DEV_DEPENDENCIES
        .iter()
        .map(|(name, range)| ((*name).to_string(), json!(range)))
        .collect();
    [Map::new(), dev, Map::new()]
}

/// The workspace policy merged with the root `package.json`, and the
/// `package.json` fields themselves.
struct Workspace {
    policy: Value,
    package_json: [Map<String, Value>; 3],
}

fn workspace(context: &Value) -> io::Result<Workspace> {
    let resolver = nullish(
        context
            .get("workspace")
            .and_then(|w| w.get(RESOLVER)),
    );
    let policy = nullish(resolver.and_then(|r| r.get("policy")));
    let empty = Value::Object(Map::new());
    let policy = object(policy.unwrap_or(&empty))?;
    if policy
        .keys()
        .any(|key| !FIELDS.contains(&key.as_str()))
    {
        return Err(decline("status workspace policy"));
    }
    let package_json = nullish(context.get("packageJson"));
    let field = |name: &str| string_map(package_json.and_then(|json| json.get(name)));
    let package_json = [field(FIELDS[0])?, field(FIELDS[1])?, field(FIELDS[2])?];
    let mut dependencies = string_map(policy.get("dependencies"))?;
    assign(&mut dependencies, &package_json[1]);
    assign(&mut dependencies, &package_json[0]);
    let mut peers = string_map(policy.get("peerDependencies"))?;
    assign(&mut peers, &package_json[2]);
    let policy = json!({ "dependencies": dependencies, "peerDependencies": peers });
    Ok(Workspace { policy, package_json })
}

/// What `policy.input` is computed from.
struct Sources<'s> {
    context: &'s Value,
    target: &'s Value,
    version: Option<&'s Value>,
    manual: &'s [Map<String, Value>; 3],
    workspace: &'s Workspace,
}

impl Sources<'_> {
    /// `policy.input` with its `resolution.grammar`.
    fn input(&self) -> io::Result<Value> {
        let merge = merge_policy(self.target)?;
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
        let mut automatic = [Map::new(), Map::new(), node_peers(self.manual)];
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
            "manual": self.manual,
            "packageJson": self.workspace.package_json,
            "selfIdentity": full_identity(self.target)?,
            "environment": {
                "policy": {},
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
            "extensions": [],
            "grammar": {},
            "prefix": prefix,
            "merge": merge,
        }))
    }
}

/// The Node environment's peers, minus names its forced policy already sets.
fn node_peers(manual: &[Map<String, Value>; 3]) -> Map<String, Value> {
    NODE_PEERS
        .iter()
        .filter(|(name, _)| {
            !manual
                .iter()
                .any(|field| field.contains_key(*name))
        })
        .map(|(name, range)| ((*name).to_string(), json!(range)))
        .collect()
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

/// `@<owner>` of `owner.scope/name`.
fn default_prefix(identity: &str) -> String {
    let owner = identity
        .split('.')
        .next()
        .unwrap_or_default();
    format!(
        "@{}",
        owner
            .split('/')
            .next()
            .unwrap_or_default(),
    )
}

/// `packageName(id, storedPrefix)`.
fn package_name(identity: &str, stored_prefix: Option<&str>) -> String {
    let scope = identity
        .split('/')
        .next()
        .unwrap_or_default();
    let prefix = stored_prefix.map_or_else(
        || {
            format!(
                "@{}",
                scope
                    .split('.')
                    .next()
                    .unwrap_or_default(),
            )
        },
        str::to_string,
    );
    let name = identity.replace('/', ".");
    let owner = format!("{}.", prefix.replacen('@', "", 1));
    let name = match name.strip_prefix(&owner) {
        Some(rest) if prefix != "@bit" => rest.to_string(),
        _ => name,
    };
    format!("{prefix}/{name}")
}

#[cfg(test)]
mod policy_tests;
