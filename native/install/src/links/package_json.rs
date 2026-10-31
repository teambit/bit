//! The `node_modules/<pkg>/package.json` of a workspace component: `PackageJsonFile.createFromComponent`,
//! the dependency-resolver and pkg transformers, and `NodeModuleLinker.createPackageJson`.

use crate::model::{ComponentDependencies, Lifecycle, Manifest, WorkspaceComponent};
use serde_json::{Map, Value, json};
use std::path::Path;

const DEPENDENCY_RESOLVER: &str = "teambit.dependencies/dependency-resolver";
/// `SOURCE_DIR_SYMLINK_TO_NM`: the Windows source-dir link inside the package.
pub(super) const SOURCE_DIR: &str = "_src";

/// What the generated manifest depends on besides the component itself.
pub(super) struct PackageJsonContext<'a> {
    pub dependencies: Option<&'a ComponentDependencies>,
    /// `getCloudDomain()`, for `homepage`.
    pub cloud_domain: &'a str,
    /// Props from the env and aspect transformers (`Object.assign`ed over the manifest).
    pub props: Value,
    pub windows: bool,
    /// The component's env is of type `aspect`.
    pub is_aspect: bool,
}

/// The manifest after `createFromComponent` and the dependency-resolver and pkg transformers,
/// before an env's `modifyPackageJson`.
pub(super) fn transformed(
    component: &WorkspaceComponent,
    context: &PackageJsonContext<'_>,
) -> Manifest {
    let mut manifest = base(component, context);
    apply_dependency_resolver(&mut manifest, component, context.dependencies);
    if let Value::Object(props) = &context.props {
        manifest.extend(props.clone());
    }
    manifest
}

/// `NodeModuleLinker.createPackageJson` after the transformers.
pub(super) fn finish(
    mut manifest: Manifest,
    component: &WorkspaceComponent,
    context: &PackageJsonContext<'_>,
) -> Manifest {
    replace_placeholders(&mut manifest, component);
    if context.windows {
        manifest.insert("types".into(), format!("{SOURCE_DIR}/{}", component.main_file).into());
    }
    normalize_version(&mut manifest);
    manifest.insert("_bit_local".into(), true.into());
    manifest.insert("source".into(), component.main_file.clone().into());
    if context.is_aspect {
        add_exports_types(&mut manifest);
    }
    manifest
}

/// `createFromComponent(dir, component, addExportProperty = true)`.
fn base(component: &WorkspaceComponent, context: &PackageJsonContext<'_>) -> Manifest {
    let id = &component.id;
    let packages = |lifecycle| packages_of(context.dependencies, lifecycle);
    let mut manifest = Map::new();
    manifest.insert("name".into(), component.package_name.clone().into());
    // A new component's legacy version is `latest`, written as `0.0.1-new`.
    manifest.insert(
        "version".into(),
        id.version
            .clone()
            .unwrap_or_else(|| "latest".into())
            .into(),
    );
    if let Some(scope) = &id.scope {
        let path = scope.replacen('.', "/", 1);
        let homepage = format!("https://{}/{path}/{}", context.cloud_domain, id.name);
        manifest.insert("homepage".into(), homepage.into());
    }
    manifest.insert("main".into(), component.main_file.clone().into());
    manifest.insert("componentId".into(), serialized_id(component));
    manifest.insert("dependencies".into(), packages(Lifecycle::Runtime));
    manifest.insert("devDependencies".into(), packages(Lifecycle::Dev));
    manifest.insert("peerDependencies".into(), packages(Lifecycle::Peer));
    manifest.insert("license".into(), "SEE LICENSE IN UNLICENSED".into());
    manifest.insert("exported".into(), id.scope.is_some().into());
    manifest
}

/// `ComponentID.serialize()`: `{ scope, name, version }`; an unexported id appends its default scope.
fn serialized_id(component: &WorkspaceComponent) -> Value {
    let id = &component.id;
    let mut object = Map::new();
    if let Some(scope) = &id.scope {
        object.insert("scope".into(), scope.clone().into());
    }
    object.insert("name".into(), id.name.clone().into());
    if let Some(version) = &id.version {
        object.insert("version".into(), version.clone().into());
    }
    if id.scope.is_none()
        && let Some(scope) = &id.default_scope
    {
        object.insert("scope".into(), scope.clone().into());
    }
    Value::Object(object)
}

/// The legacy `packageDependencies` / `devPackageDependencies` / `peerPackageDependencies`.
fn packages_of(dependencies: Option<&ComponentDependencies>, lifecycle: Lifecycle) -> Value {
    let entries = dependencies.into_iter().flat_map(|deps| &deps.packages);
    let map: Map<String, Value> = entries
        .filter(|package| package.lifecycle == lifecycle)
        .map(|package| (package.name.clone(), package.version.clone().into()))
        .collect();
    Value::Object(map)
}

/// The dependency-resolver transformer: `optionalDependencies`, `peerDependenciesMeta` and the
/// `bit.peer` marker of components configured as peers.
fn apply_dependency_resolver(
    manifest: &mut Manifest,
    component: &WorkspaceComponent,
    dependencies: Option<&ComponentDependencies>,
) {
    let (optional, peers_meta) = optional_manifest(dependencies);
    manifest.insert("optionalDependencies".into(), Value::Object(optional));
    manifest.insert("peerDependenciesMeta".into(), Value::Object(peers_meta));
    let config = component.config
        .get(DEPENDENCY_RESOLVER)
        .or_else(|| {
            component.config
                .iter()
                .find_map(|(key, value)| {
                    (crate::config::aspect_id_without_version(key) == DEPENDENCY_RESOLVER)
                        .then_some(value)
                })
        })
        .unwrap_or(&Value::Null);
    if !truthy(config.get("peer")) {
        return;
    }
    let bit = manifest
        .entry("bit")
        .or_insert_with(|| json!({}));
    if let Value::Object(bit) = bit {
        bit.insert("peer".into(), true.into());
        if let Some(range) = config
            .get("defaultPeerRange")
            .filter(|range| truthy(Some(range)))
        {
            bit.insert("defaultPeerRange".into(), range.clone());
        }
    }
}

/// The `optionalDependencies` and `peerDependenciesMeta` of `DependencyList.toDependenciesManifest`.
fn optional_manifest(dependencies: Option<&ComponentDependencies>) -> (Manifest, Manifest) {
    let (mut optional, mut peers_meta) = (Map::new(), Map::new());
    let Some(dependencies) = dependencies else { return (optional, peers_meta) };
    let packages = dependencies.packages
        .iter()
        .filter(|package| package.optional)
        .map(|package| (package.name.as_str(), Some(package.version.as_str()), package.lifecycle));
    let components = dependencies.components
        .iter()
        .filter(|dep| dep.optional)
        .map(|dep| (dep.package_name.as_str(), dep.id.version.as_deref(), dep.lifecycle));
    for (name, version, lifecycle) in packages.chain(components) {
        if lifecycle == Lifecycle::Runtime
            && let Some(version) = version
        {
            optional.insert(name.to_owned(), snap_to_semver(version).into());
        }
        if lifecycle == Lifecycle::Peer {
            peers_meta.insert(name.to_owned(), json!({ "optional": true }));
        }
    }
    (optional, peers_meta)
}

/// `replacePlaceHolders` on top-level strings and, recursively, on `exports`.
fn replace_placeholders(manifest: &mut Manifest, component: &WorkspaceComponent) {
    let values = Placeholders::new(component);
    for value in manifest.values_mut() {
        if let Value::String(template) = value {
            *template = values.format(template);
        }
    }
    if let Some(exports @ (Value::Object(_) | Value::Array(_))) = manifest.get_mut("exports") {
        replace_recursive(exports, &values);
    }
}

fn replace_recursive(value: &mut Value, values: &Placeholders) {
    match value {
        Value::String(template) => *template = values.format(template),
        Value::Object(map) => map.values_mut().for_each(|value| replace_recursive(value, values)),
        Value::Array(items) => items.iter_mut().for_each(|value| replace_recursive(value, values)),
        _ => {}
    }
}

/// `latest` becomes `0.0.1-new`, a snap becomes `0.0.0-<hash>`; an unset version is dropped.
fn normalize_version(manifest: &mut Manifest) {
    match manifest.get_mut("version") {
        Some(Value::String(version)) if version == "latest" => *version = "0.0.1-new".into(),
        Some(Value::String(version)) => *version = snap_to_semver(version),
        _ => {}
    }
}

/// Aspects get `exports.types` (before `default`) so TypeScript finds their types.
fn add_exports_types(manifest: &mut Manifest) {
    let Some(types) = manifest
        .get("types")
        .filter(|types| truthy(Some(types)))
        .cloned()
    else {
        return;
    };
    let Some(exports) = manifest
        .get_mut("exports")
        .filter(|exports| truthy(Some(exports)))
    else {
        return;
    };
    let exports = if truthy(exports.get(".")) { &mut exports["."] } else { exports };
    let Value::Object(exports) = exports else { return };
    if truthy(exports.get("types")) {
        return;
    }
    let default = exports.get("default").cloned();
    if truthy(default.as_ref()) {
        exports.shift_remove("default");
    }
    let types = types.as_str().map_or_else(|| types.to_string(), str::to_owned);
    exports.insert("types".into(), format!("./{types}").into());
    if let Some(default) = default {
        exports.insert("default".into(), default);
    }
}

/// `snapToSemver`: a hash version becomes `0.0.0-<hash>`.
pub(super) fn snap_to_semver(version: &str) -> String {
    let is_hash =
        (3..=40).contains(&version.len()) && version.bytes().all(|byte| byte.is_ascii_hexdigit());
    if is_hash { format!("0.0.0-{version}") } else { version.to_owned() }
}

/// JavaScript truthiness of an optional JSON value.
fn truthy(value: Option<&Value>) -> bool {
    match value {
        None | Some(Value::Null) => false,
        Some(Value::Bool(flag)) => *flag,
        Some(Value::Number(number)) => number
            .as_f64()
            .is_some_and(|number| number != 0.0),
        Some(Value::String(text)) => !text.is_empty(),
        Some(_) => true,
    }
}

/// `replacePlaceHolderForPackageValue` with `string-format`'s template syntax.
struct Placeholders {
    main_file: String,
    name: String,
    scope: Option<String>,
    scope_id: Option<String>,
    owner: Option<String>,
}

impl Placeholders {
    fn new(component: &WorkspaceComponent) -> Self {
        let scope_id = component.id.effective_scope().map(str::to_owned);
        let (owner, scope) = match scope_id
            .as_deref()
            .map(|id| id.split('.').collect::<Vec<_>>())
        {
            Some(parts) if parts.len() > 1 => {
                (Some(parts[0].to_owned()), Some(parts[1].to_owned()))
            }
            _ => (None, scope_id.clone()),
        };
        let name = component.id.name.replace('/', ".");
        Self { main_file: component.main_file.clone(), name, scope, scope_id, owner }
    }

    fn format(&self, template: &str) -> String {
        if template.contains("{main}.js") && self.main_file.ends_with(".d.ts") {
            return String::new();
        }
        let mut output = String::with_capacity(template.len());
        let mut rest = template;
        while let Some(index) = rest.find(['{', '}']) {
            output.push_str(&rest[..index]);
            rest = self.format_at(&rest[index..], &mut output);
        }
        output.push_str(rest);
        output
    }

    /// Format the `{`/`}` at the start of `rest` and return what follows it.
    fn format_at<'a>(&self, rest: &'a str, output: &mut String) -> &'a str {
        let brace = &rest[..1];
        if rest[1..].starts_with(brace) {
            output.push_str(brace);
            return &rest[2..];
        }
        if let ("{", Some(end)) = (brace, rest.find('}')) {
            output.push_str(&self.lookup(&rest[1..end]));
            return &rest[end + 1..];
        }
        output.push_str(brace);
        &rest[1..]
    }

    /// `string-format`'s lookup on `[values]`: `key!transformer` ignores the (unregistered)
    /// transformer, an implicit or `0` key stringifies the values object, unknown keys are empty.
    fn lookup(&self, field: &str) -> String {
        let key = match field.split_once('!') {
            Some((key, transformer)) if !transformer.is_empty() => key,
            _ => field,
        };
        let key = key.strip_prefix("0.").unwrap_or(key);
        if key.is_empty() || key == "0" {
            return "[object Object]".into();
        }
        let value = match key {
            "main" => Some(main_without_extension(&self.main_file)),
            "name" => Some(self.name.clone()),
            "scope" => self.scope.clone(),
            "scopeId" => self.scope_id.clone(),
            "owner" => self.owner.clone(),
            _ => None,
        };
        value.unwrap_or_default()
    }
}

/// `getMainFileWithoutExtension`.
fn main_without_extension(main_file: &str) -> String {
    let extension = Path::new(main_file)
        .extension()
        .map(|ext| format!(".{}", ext.to_string_lossy()));
    match extension {
        Some(extension) if !main_file.ends_with('/') => main_file
            .strip_suffix(&extension)
            .unwrap_or(main_file)
            .to_owned(),
        _ => main_file.to_owned(),
    }
}

#[cfg(test)]
mod tests;
