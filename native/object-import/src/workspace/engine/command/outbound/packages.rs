//! Retain native linker inputs before transfer; Stage selects only acknowledged bitmap promotions.
use super::{Plan, Prepare, invalid, model};
use crate::workspace::engine::{client_status::config, dependency_graph::proof};
use serde_json::{Value, json};
use std::{collections::HashSet, io};

#[derive(Default)]
pub(super) struct Prepared {
    plans: Vec<Value>,
    context: Value,
    roots: Option<std::path::PathBuf>,
    cloud: String,
    proofs: Vec<proof::Proof>,
}

pub(super) fn prepare(input: &Prepare, plan: &Plan) -> io::Result<Prepared> {
    if !input.native_packages || plan.pending.is_empty() {
        return Ok(Prepared::default());
    }
    let proofs = controls(input)?;
    let workspace = crate::effective_workspace_configuration(&input.root, &input.home)?;
    let settings = config::configuration_value(&input.root, &workspace, true)?;
    let targets = config::context_targets(&input.root, &settings)?;
    let mut prepared = Prepared {
        proofs,
        context: json!({"workspace":workspace,"targets":targets}),
        cloud: super::hub::configuration(input)?
            .get("cloud_domain")
            .and_then(Value::as_str)
            .unwrap_or("bit.cloud")
            .to_owned(),
        ..Prepared::default()
    };
    prepared.roots = roots(input, &workspace)?;
    let index = config::document(&crate::scope_path(&input.root).join("index.json"))?;
    let hashes = plan.pending
        .iter()
        .flat_map(|batch| batch.objects.iter().map(|object| object.hash.as_str()))
        .collect::<HashSet<_>>();
    for target in &targets {
        if eligible(target)
            && let Some(row) = component(
                input,
                target,
                &index,
                &hashes,
                plan.resume.is_some(),
                &mut prepared.proofs,
            )?
        {
            prepared.plans.push(row);
        }
    }
    prepared.validate()?;
    Ok(prepared)
}

fn roots(input: &Prepare, workspace: &Value) -> io::Result<Option<std::path::PathBuf>> {
    let has_root_components = workspace
        .as_object()
        .and_then(|map| {
            map.iter()
                .find_map(|(key, val)| {
                    (key == "teambit.dependencies/dependency-resolver"
                        || key.starts_with("teambit.dependencies/dependency-resolver@"))
                    .then_some(val)
                })
        })
        .is_some_and(|resolver| resolver["rootComponents"] == true);
    if !has_root_components {
        return Ok(None);
    }
    let base =
        crate::component_tracking::identity::workspace_aspect(workspace)["rootComponentsDirectory"]
            .as_str()
            .unwrap_or("node_modules");
    crate::checkout::plan::relative_path(base)?;
    Ok(Some(input.root.join(base).join(".bit_roots")))
}

fn controls(input: &Prepare) -> io::Result<Vec<proof::Proof>> {
    let mut proofs = Vec::new();
    for path in [
        input.root.join("workspace.jsonc"),
        input.home.join(".bitrc.jsonc"),
        input.root.join(".bitmap"),
        crate::scope_path(&input.root).join("index.json"),
        crate::scope_path(&input.root).join("scope.json"),
        input.transport.global_config_dir.join("config.json"),
    ] {
        proof::read(&path, &mut proofs)?;
    }
    Ok(proofs)
}

fn eligible(target: &Value) -> bool {
    target["scoped"] == false
        && target["locallyRemoved"] != true
        && target["directory"] != "."
        && target["version"]
            .as_str()
            .is_some_and(|version| !version.trim().is_empty())
}

fn component(
    input: &Prepare,
    target: &Value,
    index: &Value,
    hashes: &HashSet<&str>,
    resume: bool,
    proofs: &mut Vec<proof::Proof>,
) -> io::Result<Option<Value>> {
    let identity = target["identity"]
        .as_str()
        .map(str::trim)
        .ok_or_else(|| invalid("export package identity"))?;
    let (scope, name) = identity
        .split_once('/')
        .map(|(scope, name)| (scope.trim(), name.trim()))
        .ok_or_else(|| invalid("export package scope"))?;
    let rows = index["components"]
        .as_array()
        .or_else(|| index.as_array())
        .ok_or_else(|| invalid("export package index"))?;
    let Some(row) = rows
        .iter()
        .filter(|row| row["isSymlink"] != true)
        .find(|row| super::super::inbound::remote::file_list::row_lane_matches(row, scope, name))
    else {
        return Ok(None);
    };
    let hash = row["hash"].as_str().ok_or_else(|| invalid("export package model"))?;
    if !resume && !hashes.contains(hash) {
        return Ok(None);
    }
    let objects = crate::scope_path(&input.root).join("objects");
    proof::read(
        &objects
            .join(&hash[..2])
            .join(&hash[2..]),
        proofs,
    )?;
    let model = model::read_object(&objects, hash, "Component")?;
    let hash = resolve_version_hash(target, &model)?;
    let version = model::read_object(&objects, hash, "Version")?;
    projection(input, target, &version, proofs).map(Some)
}

fn resolve_version_hash<'a>(target: &'a Value, model: &'a Value) -> io::Result<&'a str> {
    let version_id = target["version"].as_str().ok_or_else(|| invalid("export package version"))?;
    Ok(if matches!(version_id, "" | "latest" | "head") {
        model["head"].as_str().unwrap_or(version_id)
    } else {
        model["versions"][version_id]
            .as_str()
            .or_else(|| model["orphanedVersions"][version_id].as_str())
            .unwrap_or(version_id)
    })
}

fn projection(
    input: &Prepare,
    target: &Value,
    version: &Value,
    proofs: &mut Vec<proof::Proof>,
) -> io::Result<Value> {
    let identity = target["identity"].as_str().ok_or_else(|| invalid("export package identity"))?;
    let (scope, name) = identity.split_once('/').ok_or_else(|| invalid("export package scope"))?;
    let directory =
        target["directory"].as_str().ok_or_else(|| invalid("export package directory"))?;
    crate::checkout::plan::relative_path(directory)?;
    let resolver = data(version, "teambit.dependencies/dependency-resolver")
        .ok_or_else(|| invalid("export package resolver"))?;
    let package_name =
        resolver["packageName"].as_str().ok_or_else(|| invalid("export package name"))?;
    crate::checkout::plan::relative_path(package_name)?;
    let mut target = target.clone();
    let component = input.root.join(directory).join("component.json");
    target["config"] = proof::read(&component, proofs)?
        .as_deref()
        .map(crate::recovery::jsonc::parse)
        .transpose()?
        .unwrap_or(Value::Null);
    let files = files(version)?;
    Ok(
        json!({"component":{"id":{"scope":scope,"default_scope":null,"name":name,"version":target["version"]},
        "rootDir":directory,"dir":input.root.join(directory),"files":files,"mainFile":version["mainFile"],
        "packageName":package_name,"envId":data(version, "teambit.envs/envs").and_then(|data| data["id"].as_str()).unwrap_or("teambit.harmony/node"),
        "isEnv":false,"hasPackageJson":files.iter().any(|file| file == "package.json"),"config":{}},
        "dependencies":dependencies(version, resolver)?,"props":data(version, "teambit.pkg/pkg").and_then(|data| data.get("packageJsonModification")).cloned().unwrap_or_else(|| json!({})),
        "isAspect":data(version, "teambit.envs/envs").is_some_and(|data| data["type"] == "aspect"),"target":target,"versionData":version}),
    )
}

fn data<'a>(version: &'a Value, identity: &str) -> Option<&'a Value> {
    version["extensions"]
        .as_array()?
        .iter()
        .find(|row| {
            crate::workspace::engine::client_status::config::is_extension_aspect(row, identity)
        })
        .map(|row| &row["data"])
}

fn files(version: &Value) -> io::Result<Vec<String>> {
    version["files"]
        .as_array()
        .ok_or_else(|| invalid("export package files"))?
        .iter()
        .map(|file| {
            let path =
                file["relativePath"].as_str().ok_or_else(|| invalid("export package file"))?;
            crate::checkout::plan::relative_path(path)?;
            Ok(path.to_owned())
        })
        .collect()
}

fn dependencies(version: &Value, resolver: &Value) -> io::Result<Value> {
    let rows = resolver["dependencies"]
        .as_array()
        .ok_or_else(|| invalid("export package dependencies"))?;
    let components = rows
        .iter()
        .filter(|row| row["__type"] == "component")
        .map(|row| {
            json!({"id":row["componentId"],"packageName":row["packageName"],
            "lifecycle":row["lifecycle"],"isExtension":row["isExtension"] == true,
            "optional":row["optional"] == true,"hidden":row["hidden"] == true})
        })
        .collect::<Vec<_>>();
    Ok(json!({"packages":package_dependencies(version, rows)?,"components":components,
        "policy":[],"missingPackages":{"runtime":[],"dev":[]}}))
}

// `PackageJsonFile.createFromComponent` uses legacy package fields. Component
// dependencies participate only in the optional/peer transformer metadata.
fn package_dependencies(version: &Value, dependencies: &[Value]) -> io::Result<Vec<Value>> {
    let mut packages = Vec::new();
    for (field, lifecycle) in [
        ("packageDependencies", "runtime"),
        ("devPackageDependencies", "dev"),
        ("peerPackageDependencies", "peer"),
    ] {
        let rows =
            version[field].as_object().ok_or_else(|| invalid("export package dependency field"))?;
        for (name, version) in rows {
            let version =
                version.as_str().ok_or_else(|| invalid("export package dependency version"))?;
            let optional = dependencies
                .iter()
                .any(|row| {
                    row["__type"] == "package"
                        && row["id"] == *name
                        && row["lifecycle"] == lifecycle
                        && row["optional"] == true
                });
            packages.push(
                json!({"name":name,"version":version,"lifecycle":lifecycle,"optional":optional}),
            );
        }
    }
    Ok(packages)
}

impl Prepared {
    pub(super) fn validate(&self) -> io::Result<()> {
        proof::verify(&self.proofs)
    }
    pub(super) fn receipt(&self, ids: Option<&[String]>) -> Value {
        let plans = self.plans
            .iter()
            .filter(|row| {
                ids.is_none_or(|ids| {
                    ids.iter()
                        .any(|id| row["target"]["identity"] == *id)
                })
            })
            .cloned()
            .collect::<Vec<_>>();
        json!({"packageManifestPlans":plans,"configurationContext":self.context,"rootComponentsDir":self.roots,"cloudDomain":self.cloud})
    }
}
