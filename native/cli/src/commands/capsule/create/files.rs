//! Source and package files for an isolated workspace component.

mod policy;

use bit_install::workspace::{BitmapEntry, ScopeObjects};
use serde::Serialize;
use serde_json::{Map, Value};
use std::{collections::BTreeMap, fs, io, path::Path};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct PackageComponentId<'a> {
    name: &'a str,
    #[serde(skip_serializing_if = "Option::is_none")]
    version: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    scope: Option<&'a str>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct GeneratedPackage<'a> {
    name: String,
    version: String,
    main: String,
    component_id: PackageComponentId<'a>,
    #[serde(flatten)]
    dependencies: PackageDependencies,
    license: String,
    #[serde(flatten)]
    dependency_metadata: DependencyMetadata,
    #[serde(flatten)]
    entry_points: EntryPointMetadata,
}

#[derive(Serialize)]
struct ComponentPackage<'a> {
    #[serde(flatten)]
    generated: GeneratedPackage<'a>,
    #[serde(flatten)]
    metadata: &'a Map<String, Value>,
}

pub(super) struct ManifestConfig {
    pub(super) env: BuiltinEnv,
    overrides: PackageOverrides,
}

#[derive(Default)]
struct PackageOverrides {
    name: Option<String>,
    main: Option<String>,
    license: Option<String>,
    types: Option<String>,
    exports: Option<Value>,
    optional_dependencies: Option<BTreeMap<String, String>>,
    peer_dependencies_meta: Option<Map<String, Value>>,
    metadata: Map<String, Value>,
}

#[derive(Serialize)]
struct EntryPointMetadata {
    #[serde(skip_serializing_if = "Option::is_none")]
    types: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    exports: Option<Value>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct PackageDependencies {
    dependencies: Map<String, Value>,
    dev_dependencies: Map<String, Value>,
    peer_dependencies: Map<String, Value>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DependencyMetadata {
    optional_dependencies: BTreeMap<String, String>,
    peer_dependencies_meta: Map<String, Value>,
}

#[derive(Clone, Copy)]
pub(super) enum BuiltinEnv {
    Node,
    React,
    Html,
    ReactNative,
    Aspect,
    Mdx,
    Environment,
    MdxReadme,
    BitCustomAspect,
    Empty,
}

pub(super) fn supported_builtin_manifests(
    ws_root: &Path,
    active: &[&BitmapEntry],
    selected: &[usize],
) -> io::Result<Option<Vec<ManifestConfig>>> {
    let bytes = fs::read(ws_root.join("workspace.jsonc"))?;
    let config: Value = bit_object_import::parse_jsonc(&bytes).map_err(io::Error::other)?;
    if config
        .get("teambit.workspace/variants")
        .and_then(Value::as_object)
        .is_some_and(|variants| !variants.is_empty())
    {
        return Ok(None);
    }
    let mut envs = Vec::with_capacity(selected.len());
    for &index in selected {
        let Some(manifest) = plan_manifest(ws_root, active[index])? else {
            return Ok(None);
        };
        envs.push(manifest);
    }
    Ok(Some(envs))
}

fn plan_manifest(ws_root: &Path, entry: &BitmapEntry) -> io::Result<Option<ManifestConfig>> {
    let config = entry.config.as_ref();
    let env = effective_env(ws_root, entry)?;
    let builtin = match env.as_deref() {
        None | Some("teambit.harmony/node") => BuiltinEnv::Node,
        Some("teambit.react/react") => BuiltinEnv::React,
        Some("teambit.html/html") => BuiltinEnv::Html,
        Some("teambit.react/react-native") => BuiltinEnv::ReactNative,
        Some("teambit.harmony/aspect") => BuiltinEnv::Aspect,
        Some("teambit.mdx/mdx") => BuiltinEnv::Mdx,
        Some("teambit.envs/env") => BuiltinEnv::Environment,
        Some("teambit.mdx/readme") => BuiltinEnv::MdxReadme,
        Some("teambit.harmony/bit-custom-aspect") => BuiltinEnv::BitCustomAspect,
        Some("teambit.harmony/empty-env") => BuiltinEnv::Empty,
        _ => return Ok(None),
    };
    let model_package_json =
        if entry.id.version.is_some() { model_package_json(ws_root, entry)? } else { None };
    let bitmap_package_json = config
        .and_then(|config| config.get("teambit.pkg/pkg"))
        .and_then(|pkg| pkg.get("packageJson"));
    let Some(overrides) =
        additional_package_metadata(bitmap_package_json.or(model_package_json.as_ref()))
    else {
        return Ok(None);
    };
    if has_custom_builtin_env_config(config) {
        return Ok(None);
    }
    Ok(Some(ManifestConfig { env: builtin, overrides }))
}

fn model_package_json(ws_root: &Path, entry: &BitmapEntry) -> io::Result<Option<Value>> {
    let mut id = entry.id.clone();
    if id.scope.is_none() {
        id.scope = id.effective_scope().map(str::to_owned);
    }
    let model = ScopeObjects::new(&ws_root.join(".bit"))
        .component_or_head(&id)?
        .ok_or_else(|| io::Error::other("versioned capsule component model is missing"))?;
    Ok(model.extensions
        .iter()
        .find(|extension| extension.get("name").and_then(Value::as_str) == Some("teambit.pkg/pkg"))
        .and_then(|extension| extension.get("config"))
        .and_then(|config| config.get("packageJson"))
        .cloned())
}

fn additional_package_metadata(package_json: Option<&Value>) -> Option<PackageOverrides> {
    let Some(package_json) = package_json else {
        return Some(PackageOverrides::default());
    };
    let mut metadata = package_json.as_object()?.clone();
    let name = take_nonempty_string(&mut metadata, "name")?;
    let main = take_nonempty_string(&mut metadata, "main")?;
    let license = take_nonempty_string(&mut metadata, "license")?;
    let types = take_nonempty_string(&mut metadata, "types")?;
    let exports = take_exports(&mut metadata)?;
    let optional_dependencies = take_string_map(&mut metadata, "optionalDependencies")?;
    let peer_dependencies_meta = take_peer_meta(&mut metadata)?;
    let _runtime_dependencies = take_string_map(&mut metadata, "dependencies")?;
    let _dev_dependencies = take_string_map(&mut metadata, "devDependencies")?;
    let _peer_dependencies = take_string_map(&mut metadata, "peerDependencies")?;
    let _version = take_nonempty_string(&mut metadata, "version")?;
    let generated = ["componentId"];
    if metadata
        .keys()
        .any(|key| generated.contains(&key.as_str()))
    {
        return None;
    }
    Some(PackageOverrides {
        name,
        main,
        license,
        types,
        exports,
        optional_dependencies,
        peer_dependencies_meta,
        metadata,
    })
}

fn take_peer_meta(metadata: &mut Map<String, Value>) -> Option<Option<Map<String, Value>>> {
    match metadata.remove("peerDependenciesMeta") {
        None => Some(None),
        Some(Value::Object(meta)) if meta.values().all(Value::is_object) => Some(Some(meta)),
        _ => None,
    }
}

fn take_string_map(
    metadata: &mut Map<String, Value>,
    key: &str,
) -> Option<Option<BTreeMap<String, String>>> {
    let Some(value) = metadata.remove(key) else { return Some(None) };
    let entries = value.as_object()?;
    entries
        .iter()
        .map(|(name, version)| Some((name.clone(), version.as_str()?.to_owned())))
        .collect::<Option<BTreeMap<_, _>>>()
        .map(Some)
}

fn take_exports(metadata: &mut Map<String, Value>) -> Option<Option<Value>> {
    match metadata.remove("exports") {
        None => Some(None),
        Some(value @ Value::Object(_)) => Some(Some(value)),
        Some(Value::String(value)) if !value.is_empty() => Some(Some(Value::String(value))),
        _ => None,
    }
}

fn take_nonempty_string(metadata: &mut Map<String, Value>, key: &str) -> Option<Option<String>> {
    match metadata.remove(key) {
        None => Some(None),
        Some(Value::String(value)) if !value.is_empty() => Some(Some(value)),
        _ => None,
    }
}

fn has_custom_builtin_env_config(config: Option<&Map<String, Value>>) -> bool {
    let Some(config) = config else { return false };
    [
        "teambit.react/react",
        "teambit.html/html",
        "teambit.react/react-native",
        "teambit.harmony/aspect",
        "teambit.mdx/mdx",
        "teambit.envs/env",
        "teambit.mdx/readme",
        "teambit.harmony/bit-custom-aspect",
        "teambit.harmony/empty-env",
    ]
    .iter()
    .any(|key| {
        config
            .get(*key)
            .is_some_and(|value| {
                value
                    .as_object()
                    .is_none_or(|env| !env.is_empty())
            })
    })
}

fn effective_env(ws_root: &Path, entry: &BitmapEntry) -> io::Result<Option<String>> {
    let bitmap_env = entry.config
        .as_ref()
        .and_then(|config| config.get("teambit.envs/envs"))
        .and_then(|env| env.get("env"))
        .and_then(Value::as_str);
    if entry.id.version.is_none() {
        return Ok(bitmap_env.map(str::to_owned));
    }
    let mut id = entry.id.clone();
    if id.scope.is_none() {
        id.scope = id.effective_scope().map(str::to_owned);
    }
    let model = ScopeObjects::new(&ws_root.join(".bit"))
        .component_or_head(&id)?
        .ok_or_else(|| io::Error::other("versioned capsule component model is missing"))?;
    let model_env = model.extensions
        .iter()
        .find(|ext| ext.get("name").and_then(Value::as_str) == Some("teambit.envs/envs"))
        .and_then(|ext| ext.get("config"))
        .and_then(|config| config.get("env"))
        .and_then(Value::as_str);
    Ok(model_env.or(bitmap_env).map(str::to_owned))
}

pub(super) fn component_dependency(entry: &BitmapEntry) -> (String, String) {
    let scope = entry.id.effective_scope().unwrap_or("my-scope");
    let name = format!("@{scope}/{}", entry.id.name.replace('/', "."));
    let version = entry.id.version
        .as_deref()
        .unwrap_or("latest")
        .to_owned();
    (name, version)
}

fn package_version(entry: &BitmapEntry) -> String {
    let version = entry.id.version.as_deref().unwrap_or("latest");
    if version.len() == 40 && version.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        format!("0.0.0-{version}")
    } else {
        version.to_owned()
    }
}

pub(super) fn write_default_package_json(
    capsule_dir: &Path,
    entry: &BitmapEntry,
    manifest: &ManifestConfig,
    dependencies: &BTreeMap<String, String>,
) -> io::Result<()> {
    let pkg_json_path = capsule_dir.join("package.json");
    let pkg_name = manifest.overrides.name
        .clone()
        .unwrap_or_else(|| component_dependency(entry).0);
    let stem = Path::new(&entry.main_file).with_extension("");
    let stem = stem.to_string_lossy().replace('\\', "/");
    let generated = GeneratedPackage {
        name: pkg_name,
        version: package_version(entry),
        main: manifest.overrides.main
            .clone()
            .unwrap_or_else(|| {
                if matches!(manifest.env, BuiltinEnv::Empty) {
                    entry.main_file.clone()
                } else {
                    format!("dist/{stem}.js")
                }
            }),
        component_id: PackageComponentId {
            name: &entry.id.name,
            scope: entry.id.effective_scope(),
            version: entry.id.version.as_deref(),
        },
        dependencies: policy::package_dependencies(manifest.env, dependencies),
        license: manifest.overrides.license
            .clone()
            .unwrap_or_else(|| "SEE LICENSE IN UNLICENSED".into()),
        dependency_metadata: DependencyMetadata {
            optional_dependencies: manifest.overrides.optional_dependencies
                .clone()
                .unwrap_or_default(),
            peer_dependencies_meta: manifest.overrides.peer_dependencies_meta
                .clone()
                .unwrap_or_default(),
        },
        entry_points: configured_entry_points(manifest, &stem),
    };
    let pkg = ComponentPackage { generated, metadata: &manifest.overrides.metadata };
    fs::write(&pkg_json_path, serde_json::to_string_pretty(&pkg)?)
}

fn entry_point_metadata(env: BuiltinEnv, stem: &str) -> EntryPointMetadata {
    let types = (!matches!(env, BuiltinEnv::Empty)).then(|| format!("{stem}.ts"));
    let exports = matches!(env, BuiltinEnv::Aspect).then(|| {
        let main = format!("./dist/{stem}.js");
        serde_json::json!({
            "node": { "require": main, "import": "./dist/esm.mjs" },
            "default": main,
        })
    });
    EntryPointMetadata { types, exports }
}

fn configured_entry_points(manifest: &ManifestConfig, stem: &str) -> EntryPointMetadata {
    let mut entry_points = entry_point_metadata(manifest.env, stem);
    if let Some(types) = &manifest.overrides.types {
        entry_points.types = Some(types.clone());
    }
    if let Some(exports) = &manifest.overrides.exports {
        entry_points.exports = Some(exports.clone());
    }
    entry_points
}

pub(super) fn copy_component_files(src: &Path, dst: &Path) -> io::Result<()> {
    fs::create_dir_all(dst)?;
    for entry in fs::read_dir(src)?.filter_map(Result::ok) {
        let name = entry.file_name();
        if name == "node_modules" || name == ".git" {
            continue;
        }
        let src_path = entry.path();
        let dst_path = dst.join(&name);
        if src_path.is_dir() {
            copy_component_files(&src_path, &dst_path)?;
        } else if src_path.is_file() {
            fs::copy(&src_path, &dst_path)?;
        }
    }
    Ok(())
}
