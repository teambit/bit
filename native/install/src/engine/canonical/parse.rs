//! Bounded pre-effect validation of the actual published `lynx.install` inputs.

use super::environment::Captured;
use crate::model::Project;
use serde_json::{Map, Value};
use std::path::{Path, PathBuf};

pub(super) struct Request<'a> {
    pub(super) paths: Paths,
    pub(super) projects: Vec<Project>,
    pub(super) network: Network<'a>,
    pub(super) options: &'a Map<String, Value>,
    pub(super) environment: Captured,
}

pub(super) struct Paths {
    pub(super) root: PathBuf,
    pub(super) store: PathBuf,
    pub(super) cache: PathBuf,
    pub(super) bit: PathBuf,
}

pub(super) struct Network<'a> {
    pub(super) registry_map: &'a Map<String, Value>,
    pub(super) auth_headers: &'a Map<String, Value>,
    pub(super) proxy: &'a Map<String, Value>,
    pub(super) settings: &'a Map<String, Value>,
}

impl<'a> Request<'a> {
    pub(super) fn new(payload: &'a Value) -> Option<Self> {
        let root = absolute(payload.get("rootDir")?)?;
        let manifests = payload.get("manifestsByPaths")?.as_object()?;
        let projects = projects(manifests, &root)?;
        let options = payload.get("options")?.as_object()?;
        if !supported_options(options) {
            return None;
        }
        Some(Self {
            paths: Paths {
                root,
                store: absolute(payload.get("storeDir")?)?,
                cache: absolute(payload.get("cacheDir")?)?,
                bit: absolute(payload.get("bitDir")?)?,
            },
            projects,
            network: Network {
                registry_map: payload.get("registryMap")?.as_object()?,
                auth_headers: payload.get("authHeaderByUri")?.as_object()?,
                proxy: payload.get("proxyConfig")?.as_object()?,
                settings: payload.get("networkConfig")?.as_object()?,
            },
            options,
            environment: Captured::parse(payload)?,
        })
    }
}

fn absolute(value: &Value) -> Option<PathBuf> {
    let path = PathBuf::from(value.as_str()?);
    path.is_absolute().then_some(path)
}

fn projects(manifests: &Map<String, Value>, root: &Path) -> Option<Vec<Project>> {
    if !manifests.contains_key(root.to_str()?) {
        return None;
    }
    manifests
        .iter()
        .map(|(dir, manifest)| {
            let dir = PathBuf::from(dir);
            Some(Project {
                dir: dir.is_absolute().then_some(dir)?,
                manifest: manifest.as_object()?.clone(),
            })
        })
        .collect()
}

const OPTIONS: &[&str] = &[
    "autoInstallPeers",
    "dedupePeers",
    "enableModulesDir",
    "engineStrict",
    "excludeLinksFromLockfile",
    "lockfileOnly",
    "minimumReleaseAge",
    "minimumReleaseAgeExclude",
    "neverBuiltDependencies",
    "allowScripts",
    "dangerouslyAllowAllScripts",
    "nodeLinker",
    "nodeVersion",
    "includeOptionalDeps",
    "ignorePackageManifest",
    "dedupeInjectedDeps",
    "dryRun",
    "overrides",
    "hoistPattern",
    "publicHoistPattern",
    "hoistWorkspacePackages",
    "hoistInjectedDependencies",
    "packageImportMethod",
    "enableGlobalVirtualStore",
    "globalVirtualStoreDir",
    "patchedDependencies",
    "packageExtensions",
    "preferOffline",
    "rootComponents",
    "rootComponentsForCapsules",
    "sideEffectsCacheRead",
    "sideEffectsCacheWrite",
    "pnpmHomeDir",
    "updateAll",
    "hidePackageManagerOutput",
    "reportOptions",
    "returnListOfDepsRequiringBuild",
    "forcedHarmonyVersion",
];

fn supported_options(options: &Map<String, Value>) -> bool {
    options
        .keys()
        .all(|key| OPTIONS.contains(&key.as_str()))
}
