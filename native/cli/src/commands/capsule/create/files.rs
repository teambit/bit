//! Source and package files for an isolated workspace component.

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
struct ComponentPackage<'a> {
    name: String,
    version: String,
    main: String,
    component_id: PackageComponentId<'a>,
    #[serde(flatten)]
    dependencies: PackageDependencies,
    license: &'static str,
    #[serde(flatten)]
    dependency_metadata: DependencyMetadata,
    types: String,
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
    peer_dependencies_meta: BTreeMap<String, String>,
}

#[derive(Clone, Copy)]
pub(super) enum BuiltinEnv {
    Node,
    React,
    Html,
    ReactNative,
}

pub(super) fn supported_builtin_manifests(
    ws_root: &Path,
    active: &[&BitmapEntry],
    selected: &[usize],
) -> io::Result<Option<Vec<BuiltinEnv>>> {
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
        let entry = active[index];
        let config = entry.config.as_ref();
        let env = effective_env(ws_root, entry)?;
        let builtin = match env.as_deref() {
            None | Some("teambit.harmony/node") => BuiltinEnv::Node,
            Some("teambit.react/react") => BuiltinEnv::React,
            Some("teambit.html/html") => BuiltinEnv::Html,
            Some("teambit.react/react-native") => BuiltinEnv::ReactNative,
            _ => return Ok(None),
        };
        if config
            .and_then(|config| config.get("teambit.pkg/pkg"))
            .is_some_and(|pkg| pkg.get("packageJson").is_some())
            || has_custom_builtin_env_config(config)
        {
            return Ok(None);
        }
        envs.push(builtin);
    }
    Ok(Some(envs))
}

fn has_custom_builtin_env_config(config: Option<&Map<String, Value>>) -> bool {
    let Some(config) = config else { return false };
    ["teambit.react/react", "teambit.html/html", "teambit.react/react-native"]
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

fn insert_dependency(map: &mut Map<String, Value>, name: &str, version: &str) {
    map.insert(name.to_owned(), Value::String(version.to_owned()));
}

fn package_dependencies(
    env: BuiltinEnv,
    component_dependencies: &BTreeMap<String, String>,
) -> PackageDependencies {
    let mut dependencies = Map::new();
    let mut dev_dependencies = Map::new();
    let mut peer_dependencies = Map::new();
    if matches!(env, BuiltinEnv::React) {
        insert_dependency(&mut dependencies, "core-js", "^3.0.0");
        for (name, version) in [
            ("@types/node", "12.20.4"),
            ("@types/react", "^19.0.0"),
            ("@types/react-dom", "^19.0.0"),
            ("@types/jest", "^26.0.0"),
            ("@babel/runtime", "7.20.0"),
            ("@types/testing-library__jest-dom", "5.9.5"),
        ] {
            insert_dependency(&mut dev_dependencies, name, version);
        }
        insert_dependency(&mut peer_dependencies, "react", "^17.0.0 || ^18.0.0 || ^19.0.0");
        insert_dependency(&mut peer_dependencies, "react-dom", "^17.0.0 || ^18.0.0 || ^19.0.0");
    } else {
        insert_dependency(&mut dev_dependencies, "@types/jest", "26.0.20");
        insert_dependency(&mut dev_dependencies, "@types/node", "22.10.5");
        match env {
            BuiltinEnv::Html => {
                insert_dependency(&mut dev_dependencies, "@teambit/html", "latest");
            }
            BuiltinEnv::ReactNative => {
                insert_dependency(&mut dev_dependencies, "@teambit/react-native", "latest");
            }
            BuiltinEnv::Node | BuiltinEnv::React => {}
        }
    }
    for (name, version) in component_dependencies {
        insert_dependency(&mut dependencies, name, version);
    }
    PackageDependencies { dependencies, dev_dependencies, peer_dependencies }
}

pub(super) fn write_default_package_json(
    capsule_dir: &Path,
    entry: &BitmapEntry,
    env: BuiltinEnv,
    dependencies: &BTreeMap<String, String>,
) -> io::Result<()> {
    let pkg_json_path = capsule_dir.join("package.json");
    let pkg_name = component_dependency(entry).0;
    let stem = Path::new(&entry.main_file).with_extension("");
    let stem = stem.to_string_lossy().replace('\\', "/");
    let pkg = ComponentPackage {
        name: pkg_name,
        version: package_version(entry),
        main: format!("dist/{stem}.js"),
        component_id: PackageComponentId {
            name: &entry.id.name,
            scope: entry.id.effective_scope(),
            version: entry.id.version.as_deref(),
        },
        dependencies: package_dependencies(env, dependencies),
        license: "SEE LICENSE IN UNLICENSED",
        dependency_metadata: DependencyMetadata {
            optional_dependencies: BTreeMap::new(),
            peer_dependencies_meta: BTreeMap::new(),
        },
        types: format!("{stem}.ts"),
    };
    fs::write(&pkg_json_path, serde_json::to_string_pretty(&pkg)?)
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
