//! pacquet's `Install` on a dedicated 32 MiB-stack thread with its own
//! multi-thread runtime, configured like `@pnpm/napi`'s `run_install_inner`.

use super::super::{
    EngineInstallOptions, EngineSettings,
    config_overlay::{CallOverlay, install_config},
    error::diagnostic,
    hooks::{BitHooks, normalize},
    reporter::{BitReporter, Renderer, ReporterGuard},
    session::{Session, engine_project},
};
use crate::model::{InstallPlan, Project};
use pnpm_package_manager::{
    DepsRequiringBuildSink, Install, InstallExecution, InstallInvocation, InstallLockfilePolicy,
    InstallProjects, ProjectMutation, ResolutionInputs, UpdateSeedPolicy,
};
use pnpm_package_manifest::DependencyGroup;
use serde_json::{Map, Value};
use std::{io, path::PathBuf, sync::Arc};

/// What one engine call produced.
pub(super) struct Outcome {
    pub added: u64,
    pub removed: u64,
    pub deps_requiring_build: Option<Vec<String>>,
    pub store_dir: PathBuf,
}

/// The owned inputs of one engine call, moved onto its thread.
pub(super) struct EngineCall {
    plan: InstallPlan,
    settings: EngineSettings,
    options: EngineInstallOptions,
}

impl EngineCall {
    pub(super) fn new(
        plan: &InstallPlan,
        settings: &EngineSettings,
        options: &EngineInstallOptions,
    ) -> Self {
        EngineCall { plan: plan.clone(), settings: settings.clone(), options: options.clone() }
    }

    /// Run on the engine thread and await the result.
    pub(super) async fn spawn(self) -> io::Result<Outcome> {
        let (sender, receiver) = tokio::sync::oneshot::channel();
        std::thread::Builder::new()
            .name("bit-install-engine".to_string())
            // The synchronous install call chain overflows a default stack.
            .stack_size(32 * 1024 * 1024)
            .spawn(move || {
                let _ = sender.send(self.run());
            })?;
        receiver.await.map_err(|_| io::Error::other("the install engine thread panicked"))?
    }

    fn run(self) -> io::Result<Outcome> {
        let raw_projects = self.projects();
        let hooks = self.hooks(&raw_projects);
        // Importers are transformed up front, each with its own dir as `workspaceDir`.
        let projects: Vec<Project> = raw_projects
            .iter()
            .map(|project| Project { dir: project.dir.clone(), manifest: hooked(&hooks, project) })
            .collect();
        let config = install_config(
            &self.settings,
            &CallOverlay {
                overrides: &self.plan.overrides,
                forced_harmony_version: self.plan.forced_harmony_version.as_deref(),
                external_dependencies: self.external_dependencies(),
                update_all: self.options.update_all,
            },
        )?;
        let reporter = ReporterGuard::install(self.renderer());
        let sink = DepsRequiringBuildSink::default();
        let session = Session::new(config, &self.settings.root, &projects)?;
        session.runtime.block_on(self.run_install(&session, projects, &hooks, Arc::clone(&sink)))?;
        let stats = ReporterGuard::take_stats();
        drop(reporter);
        Ok(Outcome {
            added: stats.added,
            removed: stats.removed,
            deps_requiring_build: take_deps_requiring_build(&sink),
            store_dir: PathBuf::from(
                config.store_dir
                    .display()
                    .to_string()
                    .trim(),
            ),
        })
    }

    /// The plan's projects; the root gets `dependenciesMeta: {}` when it has none.
    fn projects(&self) -> Vec<Project> {
        let mut projects = self.plan.projects.clone();
        let root = normalize(&self.settings.root);
        if let Some(project) = projects
            .iter_mut()
            .find(|project| normalize(&project.dir) == root)
        {
            project.manifest
                .entry("dependenciesMeta")
                .or_insert_with(|| Value::Object(Map::new()));
        }
        projects
    }

    fn hooks(&self, projects: &[Project]) -> BitHooks {
        BitHooks {
            root: self.settings.root.clone(),
            root_components: self.settings.layout.root_components,
            forced_harmony: self.plan.forced_harmony_version.is_some(),
            never_build: self.settings.policy.scripts.never_build_package_names
                .iter()
                .map(|name| name.trim().to_owned())
                .filter(|name| !name.is_empty())
                .collect(),
            raw_manifests: projects
                .iter()
                .map(|project| (normalize(&project.dir), Value::Object(project.manifest.clone())))
                .collect(),
        }
    }

    /// With root components, every non-root project name.
    fn external_dependencies(&self) -> &[String] {
        if self.settings.layout.root_components { &self.plan.external_dependencies } else { &[] }
    }

    fn renderer(&self) -> Option<Renderer> {
        let mut settings = self.settings.reporter.clone()?;
        settings.hide_added_pkgs_progress = self.options.lockfile_only;
        Some(Renderer::new(
            &settings,
            self.settings.root.display().to_string(),
            self.options.output.clone(),
        ))
    }

    async fn run_install(
        &self,
        session: &Session,
        projects: Vec<Project>,
        hooks: &BitHooks,
        sink: DepsRequiringBuildSink,
    ) -> io::Result<()> {
        // A lone project takes the plain install path; several are handed to
        // the engine as the workspace's importers.
        let workspace_projects = (projects.len() > 1).then(|| {
            projects
                .into_iter()
                .map(|project| dependency_project(project, hooks))
                .collect()
        });
        let install = session.install(self.dependency_groups());
        let install = self.configure(install, workspace_projects, sink, session);
        install.run::<BitReporter>().await.map_err(|error| diagnostic(&error))
    }

    fn dependency_groups(&self) -> Vec<DependencyGroup> {
        let mut groups = vec![DependencyGroup::Prod, DependencyGroup::Dev];
        if self.options.include_optional_deps {
            groups.push(DependencyGroup::Optional);
        }
        groups
    }

    /// `InstallShape::configure` of `@pnpm/napi` for a plain install. The
    /// in-memory manifests are compared with the lockfile by content.
    fn configure<'a>(
        &self,
        install: Install<'a, Vec<DependencyGroup>>,
        workspace_projects: Option<Vec<pnpm_workspace::Project>>,
        sink: DepsRequiringBuildSink,
        session: &'a Session,
    ) -> Install<'a, Vec<DependencyGroup>> {
        let update = self.options.update_all;
        Install {
            lockfile_policy: InstallLockfilePolicy {
                frozen: false,
                prefer_frozen: Some(!update),
                ignore_manifest_check: false,
                disable_optimistic_repeat: false,
                ..install.lockfile_policy
            },
            execution: InstallExecution {
                skip_runtimes: false,
                mutation: ProjectMutation::InstallWorkspace,
                lockfile_only: self.options.lockfile_only,
                dry_run: false,
                ..install.execution
            },
            resolution: ResolutionInputs {
                update_seed_policy: if update {
                    UpdateSeedPolicy::drop_all()
                } else {
                    UpdateSeedPolicy::KeepAll
                },
                deps_requiring_build_sink: Some(sink),
                ..install.resolution
            },
            context: InstallInvocation {
                lockfile_path: Some(&session.lockfile_path),
                ..install.context
            },
            projects: InstallProjects {
                supported_architectures: None,
                pnpmfile_hook_override: None,
                workspace_projects_override: workspace_projects,
                ..install.projects
            },
            ..install
        }
    }
}

fn dependency_project(project: Project, hooks: &BitHooks) -> pnpm_workspace::Project {
    let dependency_manifest = hooks.raw_manifests
        .get(&normalize(&project.dir))
        .map(|raw| hooks.apply(raw.clone(), None))
        .filter(|raw| raw.as_object() != Some(&project.manifest))
        .map(|raw| {
            pnpm_package_manifest::PackageManifest::from_value(
                project.dir.join("package.json"),
                raw,
            )
        });
    let mut result = engine_project(&project.dir, project.manifest);
    result.dependency_manifest = dependency_manifest;
    result
}

/// The project's manifest after Bit's hooks, with the project as `workspaceDir`.
fn hooked(hooks: &BitHooks, project: &Project) -> Map<String, Value> {
    match hooks.apply(Value::Object(project.manifest.clone()), Some(&project.dir)) {
        Value::Object(manifest) => manifest,
        _ => project.manifest.clone(),
    }
}

fn take_deps_requiring_build(sink: &DepsRequiringBuildSink) -> Option<Vec<String>> {
    sink.lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
        .take()
        .map(|deps| {
            deps.into_iter()
                .map(|dep| dep.trim().to_string())
                .filter(|dep| !dep.is_empty())
                .collect()
        })
}
