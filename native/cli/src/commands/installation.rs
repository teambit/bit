//! `ComponentWriter.finalizeWrite` after the native write: the installation
//! `installPackagesGracefully` runs, through the native installer and the
//! JavaScript host. The compile `compileGracefully` repeats runs inside it.

use crate::{
    commands::{
        color::Chalk,
        install::{self, Input, Terminal},
        status::{
            cache::cache_root,
            js::{array, text},
        },
        workspace_command::format::Formatter,
    },
    discovery::{self, Target},
    host::Host,
};
use bit_install::{
    HostInfo, InstallOptions, Outcome,
    config::{EffectiveConfig, ScopeJson, WorkspaceConfig, load_global_config, scope_path},
};
use serde_json::Value;
use std::{env, io, path::Path, sync::Arc};

const YARN: &str = "teambit.dependencies/yarn";

/// Versions passed to `ComponentWriter.finalizeWrite`: changed components and
/// newly added lane components, without duplicates.
pub(super) fn component_ids(result: &Value) -> io::Result<Vec<String>> {
    let mut ids = array(result.get("components"), "changed components")?
        .iter()
        .map(|row| text(row.get("id")).map(str::to_string))
        .collect::<io::Result<Vec<_>>>()?;
    ids.extend(
        array(result.get("addedComponents"), "added components")?
            .iter()
            .map(|id| text(Some(id)).map(str::to_string))
            .collect::<io::Result<Vec<_>>>()?,
    );
    ids.sort();
    ids.dedup();
    Ok(ids)
}

pub(super) fn error_report(chalk: Chalk, error: &str) -> String {
    let formatter = Formatter::new(chalk);
    format!(
        "{} {}\nThe following error was thrown by the package manager:\n{}\nUse \"bit install\" to complete the installation, remove the imported components using \"bit remove <comp id>\" or remove the missing dependencies from their source code",
        formatter.error_symbol(),
        formatter.title("Installation Error"),
        formatter.chalk.red(error),
    )
}

/// The JavaScript host the installation calls, started before anything is
/// fetched or written, so a host that cannot serve leaves the command to Node.
pub struct Installer {
    host: Arc<Host>,
    info: HostInfo,
}

impl Installer {
    /// It sets `PATH` for the package manager, so it runs before the engine
    /// starts its threads.
    pub fn start(root: &Path, argv: &[&str]) -> io::Result<Self> {
        let package_manager = WorkspaceConfig::load(root)?.dependency_resolver.package_manager;
        if package_manager.as_deref() == Some(YARN) {
            return Err(io::Error::other("the yarn package manager"));
        }
        let Target::Entry(cli) = discovery::find()? else {
            return Err(io::Error::other("the Node.js CLI is only reachable as a wrapper"));
        };
        let argv: Vec<String> = argv
            .iter()
            .map(|arg| (*arg).to_string())
            .collect();
        let terminal = Terminal::detect(&argv);
        let host = Arc::new(Host::new(cli, root.to_path_buf(), terminal.color));
        let info = install::host_info(&host, &terminal)?;
        Ok(Self { host, info })
    }

    /// `InstallMain.install(undefined, { dedupe, import: false, writeConfigFiles,
    /// dependenciesGraph })` for the imported `ids`.
    pub fn install(
        self,
        root: &Path,
        skip_write_config_files: bool,
        ids: &[String],
    ) -> io::Result<()> {
        let dependencies_graph = if deps_graph_enabled(root)? {
            let ids: Vec<(String, String)> = ids
                .iter()
                .filter_map(|id| {
                    let (name, version) = id.rsplit_once('@')?;
                    Some((name.to_string(), version.to_string()))
                })
                .collect();
            bit_install::stored_graphs(root, &ids)?
        } else {
            None
        };
        let options = InstallOptions {
            programmatic: true,
            skip_import: true,
            skip_write_config_files,
            dependencies_graph,
            ..InstallOptions::default()
        };
        let input = Input::Options(Box::new(options));
        match install::run_install(root.to_path_buf(), input, self.info, self.host)?? {
            Outcome::Installed(_) | Outcome::Skipped => Ok(()),
            Outcome::Help | Outcome::Unsupported => {
                Err(io::Error::other("the workspace's package manager is not supported"))
            }
        }
    }
}

/// `isFeatureEnabled(DEPS_GRAPH)`: `BIT_FEATURES`, else the `features` config.
fn deps_graph_enabled(root: &Path) -> io::Result<bool> {
    let features = if let Some(features) = env::var("BIT_FEATURES")
        .ok()
        .filter(|features| !features.is_empty())
    {
        Some(features)
    } else {
        let global = load_global_config(&cache_root().join("config"))?;
        let scope = ScopeJson::load(&scope_path(root))?;
        let workspace = WorkspaceConfig::load(root)?;
        EffectiveConfig::new(&global, &scope.config, &workspace.config_store).get("features")
    };
    Ok(features.is_some_and(|features| {
        features
            .split(',')
            .any(|feature| feature.trim() == "deps-graph")
    }))
}
