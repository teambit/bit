//! What every engine call builds before `Install::new`: the HTTP client, the
//! lazily loaded wanted lockfile and a multi-thread runtime
//! (`run_install_inner` in `@pnpm/napi`).

use super::{config_overlay::http_client, hooks::normalize};
use crate::model::Project;
use pnpm_config::Config;
use pnpm_lockfile::{LazyLockfile, MaybeLazyLockfile};
use pnpm_network::ThrottledClient;
use pnpm_package_manager::{Install, ResolvedPackages};
use pnpm_package_manifest::{DependencyGroup, PackageManifest};
use pnpm_tarball::MemCache;
use serde_json::{Map, Value};
use std::{
    io,
    path::{Path, PathBuf},
    sync::Arc,
};

/// One engine call's shared state; `Install` borrows from it.
pub(super) struct Session {
    config: &'static Config,
    client: Arc<ThrottledClient>,
    lockfile: LazyLockfile,
    pub lockfile_path: PathBuf,
    resolved_packages: ResolvedPackages,
    /// The root importer's manifest.
    manifest: PackageManifest,
    pub runtime: tokio::runtime::Runtime,
}

impl Session {
    /// A session for the workspace at `root`, whose importer is the project at `root`.
    pub(super) fn new(
        config: &'static Config,
        root: &Path,
        projects: &[Project],
    ) -> io::Result<Self> {
        let lockfile = if config.lockfile {
            LazyLockfile::deferred(root.to_path_buf(), config.wanted_lockfile_selection())
        } else {
            LazyLockfile::disabled()
        };
        Ok(Session {
            config,
            client: http_client(config)?,
            lockfile,
            lockfile_path: root.join(config.wanted_lockfile_name().trim()),
            resolved_packages: ResolvedPackages::new(),
            manifest: root_manifest(projects, root)?,
            runtime: tokio::runtime::Builder::new_multi_thread().enable_all().build()?,
        })
    }

    /// `Install::new` over this session.
    pub(super) fn install(
        &self,
        groups: Vec<DependencyGroup>,
    ) -> Install<'_, Vec<DependencyGroup>> {
        Install::new(
            Arc::new(MemCache::new()),
            &self.resolved_packages,
            (&self.client, Arc::clone(&self.client)),
            self.config,
            &self.manifest,
            MaybeLazyLockfile::Lazy(&self.lockfile),
            groups,
        )
    }
}

/// The manifest of the project at `root`.
fn root_manifest(projects: &[Project], root: &Path) -> io::Result<PackageManifest> {
    if projects.is_empty() {
        return Err(io::Error::other(format!(
            "the install plan has no projects for {}",
            root.display(),
        )));
    }
    let root = normalize(root);
    let project = projects
        .iter()
        .find(|project| normalize(&project.dir) == root)
        .ok_or_else(|| {
            io::Error::other(format!("the install plan has no project for {}", root.display()))
        })?;
    Ok(PackageManifest::from_value(
        root.join("package.json"),
        Value::Object(project.manifest.clone()),
    ))
}

/// An engine importer of a project with its (transformed) manifest.
pub(super) fn engine_project(dir: &Path, manifest: Map<String, Value>) -> pnpm_workspace::Project {
    pnpm_workspace::Project {
        root_dir: dir.to_path_buf(),
        manifest: PackageManifest::from_value(dir.join("package.json"), Value::Object(manifest)),
        dependency_manifest: None,
    }
}
