//! Source and package files for an isolated workspace component.

use bit_install::workspace::BitmapEntry;
use serde::Serialize;
use serde_json::Value;
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
    dependencies: BTreeMap<String, String>,
    dev_dependencies: BTreeMap<String, String>,
    peer_dependencies: BTreeMap<String, String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DependencyMetadata {
    optional_dependencies: BTreeMap<String, String>,
    peer_dependencies_meta: BTreeMap<String, String>,
}

pub(super) fn standard_node_manifests(
    ws_root: &Path,
    active: &[&BitmapEntry],
    selected: &[usize],
) -> io::Result<bool> {
    let bytes = fs::read(ws_root.join("workspace.jsonc"))?;
    let config: Value = bit_object_import::parse_jsonc(&bytes).map_err(io::Error::other)?;
    if config
        .get("teambit.workspace/variants")
        .and_then(Value::as_object)
        .is_some_and(|variants| !variants.is_empty())
    {
        return Ok(false);
    }
    for &index in selected {
        let entry = active[index];
        if ws_root
            .join(&entry.root_dir)
            .join("package.json")
            .exists()
        {
            return Ok(false);
        }
        let config = entry.config.as_ref();
        if config
            .and_then(|config| config.get("teambit.envs/envs"))
            .and_then(|env| env.get("env"))
            .and_then(Value::as_str)
            .is_some_and(|env| env != "teambit.harmony/node")
            || config
                .and_then(|config| config.get("teambit.pkg/pkg"))
                .is_some_and(|pkg| pkg.get("packageJson").is_some())
        {
            return Ok(false);
        }
    }
    Ok(true)
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
    dependencies: &BTreeMap<String, String>,
) -> io::Result<()> {
    let pkg_json_path = capsule_dir.join("package.json");
    if pkg_json_path.exists() {
        return Ok(());
    }
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
        dependencies: PackageDependencies {
            dependencies: dependencies.clone(),
            dev_dependencies: BTreeMap::from([
                ("@types/jest".into(), "26.0.20".into()),
                ("@types/node".into(), "22.10.5".into()),
            ]),
            peer_dependencies: BTreeMap::new(),
        },
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
