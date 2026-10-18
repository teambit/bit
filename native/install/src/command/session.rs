//! What one `bit install` invocation works with: the process facts, and the
//! workspace state loaded from disk (reloaded after every config edit).

mod component_order;

use crate::{
    Host, HostInfo,
    config::{EffectiveConfig, ScopeJson, WorkspaceConfig, load_global_config},
    engine::{self, EngineSettings, EnvVars},
    model::{GlobalConfig, WorkspaceComponent},
    options::InstallOptions,
    output::Output,
    workspace::Workspace,
};
use std::{
    io,
    path::{Path, PathBuf},
    sync::OnceLock,
    time::Instant,
};

/// `OutsideWorkspaceError`.
const OUTSIDE_WORKSPACE: &str = "This command can only be run inside a bit workspace. Please check that you are inside a bit workspace and then re-run (to initialize a new workspace please use bit init)";

const YARN: &str = "teambit.dependencies/yarn";
const BIT_ASPECT: &str = "teambit.harmony/bit";

/// The process side of the command.
pub struct Session<'a> {
    pub root: PathBuf,
    pub options: &'a InstallOptions,
    pub info: &'a HostInfo,
    pub host: &'a dyn Host,
    pub output: Output,
    pub started: Instant,
    /// The Bit Cloud username, looked up once per command (`PnpmPackageManager.username`):
    /// `None` inside means the lookup ran and the install stays `anonymous`.
    pub cloud_username: OnceLock<Option<String>>,
}

impl Session<'_> {
    /// `workspace.list()` as the component loader announces it: every
    /// bitmap component, the workspace-root component included.
    pub fn loading(&self, loaded: &Loaded) {
        let count = loaded.workspace.active().count();
        self.output.status(&format!("loading {count} component(s)"));
    }

    /// Bit's core aspect ids, `teambit.harmony/bit` included.
    pub fn core_ids(&self) -> Vec<String> {
        self.info.core_aspects
            .iter()
            .map(|aspect| aspect.id.clone())
            .chain([BIT_ASPECT.to_string()])
            .collect()
    }
}

/// The workspace root: the closest directory with a `workspace.jsonc`.
pub fn find_root(cwd: &Path) -> io::Result<PathBuf> {
    cwd.ancestors()
        .find(|dir| dir.join("workspace.jsonc").is_file())
        .map(Path::to_path_buf)
        .ok_or_else(|| io::Error::new(io::ErrorKind::NotFound, OUTSIDE_WORKSPACE))
}

/// The workspace state the command acts on.
pub struct Loaded {
    pub config: WorkspaceConfig,
    /// The layered `bit config` (environment, workspace, scope, global).
    pub global: GlobalConfig,
    pub effective: EffectiveConfig,
    pub workspace: Workspace,
    pub engine: EngineSettings,
}

impl Loaded {
    pub fn load(session: &Session<'_>) -> io::Result<Self> {
        let config = WorkspaceConfig::load(&session.root)?;
        let mut workspace = Workspace::load(&session.root, &config, &session.core_ids())?;
        component_order::apply(&mut workspace, &session.options.workspace_component_order)?;
        let scope = ScopeJson::load(&workspace.scope_path)?;
        let stored = load_global_config(&session.info.global_config_dir)?;
        let effective = EffectiveConfig::new(&stored, &scope.config, &config.config_store);
        // `configGetter`: environment, workspace, scope, then the global config.
        let global = effective.merged();
        let mut engine = engine::settings(
            &session.root,
            &config.dependency_resolver,
            &global,
            session.info,
            &EnvVars::from_process(),
        )?;
        if let Some(Some(username)) = session.cloud_username.get() {
            engine::apply_cloud_username(&mut engine, username);
        }
        // `reportOptions.appendOnly = optimizeReportForNonTerminal`.
        if let Some(reporter) = engine.reporter.as_mut() {
            reporter.append_only |= session.options.append_only;
        }
        Ok(Self { config, global, effective, workspace, engine })
    }

    /// Yarn is a JavaScript package manager: such workspaces keep the TypeScript command.
    pub fn uses_yarn(&self) -> bool {
        self.config.dependency_resolver.package_manager.as_deref() == Some(YARN)
    }

    /// `workspace.name`: the configured name, else the root directory's name.
    pub fn workspace_name(&self, root: &Path) -> String {
        self.config.workspace.name
            .clone()
            .unwrap_or_else(|| {
                root.file_name()
                    .map(|name| name.to_string_lossy().into_owned())
                    .unwrap_or_default()
            })
    }

    /// `getComponentsDirectory([])`: the workspace components, without the one
    /// rooted at the workspace directory.
    pub fn components(&self) -> Vec<WorkspaceComponent> {
        self.workspace
            .active()
            .filter(|(entry, _)| entry.root_dir != ".")
            .map(|(_, component)| component.clone())
            .collect()
    }
}
