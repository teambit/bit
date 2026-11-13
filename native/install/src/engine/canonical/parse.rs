//! Bounded pre-effect validation of the actual published `lynx.install` inputs.
//!
//! Parses and validates workspace paths, project manifests, network maps, and install options into [`Request`].

use super::environment::Captured;
use crate::model::Project;
use serde_json::{Map, Value};
use std::path::{Path, PathBuf};

/// Validated canonical `lynx.install` request holding [`Paths`], [`Project`] list, [`Network`] maps, and [`Captured`] environment.
pub(super) struct Request<'a> {
    pub(super) paths: Paths,
    pub(super) projects: Vec<Project>,
    pub(super) network: Network<'a>,
    pub(super) options: &'a Map<String, Value>,
    pub(super) environment: Captured,
}

/// Validated absolute workspace, store, cache, and `.bit` directory paths.
#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub(super) struct Paths {
    pub(super) root: PathBuf,
    pub(super) store: PathBuf,
    pub(super) cache: PathBuf,
    pub(super) bit: PathBuf,
}

/// Borrowed registry, auth, proxy, and network JSON [`Map`] references from a canonical install [`Request`].
#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) struct Network<'a> {
    pub(super) registry_map: &'a Map<String, Value>,
    pub(super) auth_headers: &'a Map<String, Value>,
    pub(super) proxy: &'a Map<String, Value>,
    pub(super) settings: &'a Map<String, Value>,
}

impl<'a> Request<'a> {
    /// Validates and constructs a [`Request`] from the raw canonical install `payload`.
    pub(super) fn new(payload: &'a Value) -> Option<Self> {
        let options = payload.get("options")?.as_object()?;
        if !supported_options(options) {
            return None;
        }
        let paths = Paths {
            root: absolute(payload.get("rootDir")?)?,
            store: absolute(payload.get("storeDir")?)?,
            cache: absolute(payload.get("cacheDir")?)?,
            bit: absolute(payload.get("bitDir")?)?,
        };
        let network = Network {
            registry_map: payload.get("registryMap")?.as_object()?,
            auth_headers: payload.get("authHeaderByUri")?.as_object()?,
            proxy: payload.get("proxyConfig")?.as_object()?,
            settings: payload.get("networkConfig")?.as_object()?,
        };
        let environment = Captured::parse(payload)?;
        let manifests = payload.get("manifestsByPaths")?.as_object()?;
        let projects = projects(manifests, &paths.root)?;
        Some(Self { paths, projects, network, options, environment })
    }
}

/// Extract and validate an absolute [`PathBuf`] from JSON string [`Value`] `value`.
#[inline]
fn absolute(value: &Value) -> Option<PathBuf> {
    parse_absolute_str(value.as_str()?)
}

#[inline]
fn parse_absolute_str(text: &str) -> Option<PathBuf> {
    let trimmed = text.trim();
    if trimmed.is_empty() || trimmed.contains(['\0', '\n', '\r']) {
        return None;
    }
    let path = PathBuf::from(trimmed);
    path.is_absolute().then_some(path)
}

#[inline]
fn projects(manifests: &Map<String, Value>, root: &Path) -> Option<Vec<Project>> {
    let parsed: Vec<Project> = manifests
        .iter()
        .map(|(dir, manifest)| {
            Some(Project { dir: parse_absolute_str(dir)?, manifest: manifest.as_object()?.clone() })
        })
        .collect::<Option<_>>()?;
    parsed
        .iter()
        .any(|project| project.dir == root)
        .then_some(parsed)
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

#[inline]
fn supported_options(options: &Map<String, Value>) -> bool {
    options
        .keys()
        .all(|key| OPTIONS.contains(&key.trim()))
}
