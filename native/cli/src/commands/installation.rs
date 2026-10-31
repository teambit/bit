//! `ComponentWriter.finalizeWrite` after the native write: the installation
//! `installPackagesGracefully` runs, through the native installer and the
//! JavaScript host. The compile `compileGracefully` repeats runs inside it.

mod canonical;

use crate::{
    commands::{
        color::Chalk,
        install::{self, Input, Terminal},
        status::js::{array, text},
        workspace_command::format::Formatter,
    },
    discovery::{self, Target},
    host::Host,
};
use bit_install::{HostInfo, InstallOptions, Outcome, config::WorkspaceConfig, output::Output};
use canonical::{canonical_workspace, deps_graph_enabled};
use serde_json::{Value, json};
use std::{io, path::Path, sync::Arc};

const YARN: &str = "teambit.dependencies/yarn";

/// Versions passed to `ComponentWriter.finalizeWrite`: changed components and
/// newly added lane components, without duplicates.
pub(super) fn component_ids(result: &Value) -> io::Result<Vec<String>> {
    let mut ids = changed_component_ids(result)?;
    ids.extend(
        array(result.get("addedComponents"), "added components")?
            .iter()
            .map(|id| text(Some(id)).map(str::to_string))
            .collect::<io::Result<Vec<_>>>()?,
    );
    if result.get("newFromLaneAdded") == Some(&Value::Bool(true)) {
        ids.extend(
            array(result.get("newFromLane"), "new lane components")?
                .iter()
                .map(|id| text(Some(id)).map(str::to_string))
                .collect::<io::Result<Vec<_>>>()?,
        );
    }
    ids.sort();
    ids.dedup();
    Ok(ids)
}

/// `checkout reset` installs only genuinely changed components; a restored
/// directory appears under `addedComponents` but Node skips installation.
pub(super) fn changed_component_ids(result: &Value) -> io::Result<Vec<String>> {
    array(result.get("components"), "changed components")?
        .iter()
        .map(|row| text(row.get("id")).map(str::to_string))
        .collect()
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
    cache_initialized: bool,
}

/// The two graceful results of `ComponentWriter.finalizeWrite` after an import.
pub(in crate::commands) struct ImportErrors {
    pub installation: Option<String>,
    pub compilation: Option<String>,
    pub installation_reported: bool,
}

impl Installer {
    /// Process facts precede workers; the same Host later initializes checkout providers.
    pub(in crate::commands) fn into_parts(
        self,
    ) -> io::Result<(crate::commands::status::environments::Environments, HostInfo)> {
        let host = Arc::try_unwrap(self.host)
            .map_err(|_| io::Error::other("installation Host is still borrowed"))?;
        Ok((crate::commands::status::environments::Environments::from_host(host), self.info))
    }
    /// Reject unsupported package managers before parent-operation providers start.
    pub(in crate::commands) fn validate_workspace(root: &Path) -> io::Result<()> {
        let package_manager = WorkspaceConfig::load(root)?.dependency_resolver.package_manager;
        if package_manager.as_deref() == Some(YARN) {
            return Err(io::Error::other("the yarn package manager"));
        }
        Ok(())
    }

    /// A configured user class may register mutable `InstallMain` or package-manager callbacks.
    /// Keep those workspaces on the released installation class before native install effects.
    pub(in crate::commands) fn needs_canonical(root: &Path) -> bool {
        canonical_workspace(root, false).unwrap_or(true)
    }

    pub(in crate::commands) fn needs_service_callbacks(root: &Path) -> bool {
        canonical_workspace(root, true).unwrap_or(true)
    }

    /// Keep the already loaded providers and process facts of a parent operation.
    pub(in crate::commands) const fn from_host(host: Arc<Host>, info: HostInfo) -> Self {
        Self { host, info, cache_initialized: false }
    }

    /// Checkout and installation share the same consumer's single invalidation check.
    pub(in crate::commands) const fn with_initialized_cache(mut self, initialized: bool) -> Self {
        self.cache_initialized = initialized;
        self
    }

    /// `RenamingMain.installDepsGracefully` installs without updating existing policy entries.
    pub(in crate::commands) fn install_scope_rename(self, root: &Path) -> io::Result<()> {
        let options = InstallOptions {
            programmatic: true,
            skip_import: true,
            copy_peer_to_runtime_on_root: Some(true),
            copy_peer_to_runtime_on_components: false,
            existing_entries: bit_install::ExistingEntries::Fail,
            ..InstallOptions::default()
        };
        self.run_options(
            root,
            options,
            &json!({
                "dedupe":true,"import":false,"copyPeerToRuntimeOnRoot":true,
                "copyPeerToRuntimeOnComponents":false,"updateExisting":false,
            }),
            false,
        )
    }

    /// Fork propagates the same native installation result without rename's graceful catch.
    pub(in crate::commands) fn install_fork(self, root: &Path) -> io::Result<()> {
        self.install_scope_rename(root)
    }

    /// It sets `PATH` for the package manager, so it runs before the engine
    /// starts its threads.
    pub fn start(root: &Path, argv: &[&str]) -> io::Result<Self> {
        Self::validate_workspace(root)?;
        let Target::Entry(cli) = discovery::find()? else {
            return Err(io::Error::other("the Node.js CLI is only reachable as a wrapper"));
        };
        let argv: Vec<String> = argv
            .iter()
            .map(|arg| (*arg).to_string())
            .collect();
        let terminal = Terminal::detect(&argv);
        let host = Arc::new(Host::new(cli, root.to_path_buf(), terminal.color));
        let info = install::host_info_for(&host, &terminal, Self::needs_canonical(root))?;
        Ok(Self { host, info, cache_initialized: false })
    }

    /// `InstallMain.install(undefined, { dedupe, import: false, writeConfigFiles,
    /// dependenciesGraph })` for the imported `ids`.
    pub fn install(
        self,
        root: &Path,
        skip_write_config_files: bool,
        ids: &[String],
    ) -> io::Result<()> {
        self.install_ordered(root, skip_write_config_files, ids, &[])
    }

    pub(in crate::commands) fn install_ordered(
        self,
        root: &Path,
        skip_write_config_files: bool,
        ids: &[String],
        workspace_component_order: &[String],
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
        let mut canonical = json!({
            "dedupe":true,"updateExisting":false,"import":false,
            "writeConfigFiles":!skip_write_config_files,
        });
        if let Some(graph) = &dependencies_graph {
            canonical["dependenciesGraph"] = graph.clone();
        }
        self.run_ordered(
            root,
            skip_write_config_files,
            dependencies_graph,
            workspace_component_order,
            &canonical,
            true,
        )
    }

    /// The published writer compiles even after its graceful install failure.
    /// Retain both class calls when the live Host has a bitmap scan error or a
    /// custom installation callback; ordinary imports use native installation.
    pub(in crate::commands) fn install_import(
        self,
        root: &Path,
        skip_write_config_files: bool,
        ids: &[String],
        workspace_component_order: &[String],
    ) -> io::Result<ImportErrors> {
        if !self.canonical_needed(root) {
            return Ok(ImportErrors {
                installation: self
                    .install_ordered(root, skip_write_config_files, ids, workspace_component_order)
                    .err()
                    .map(|error| error.to_string()),
                compilation: None,
                installation_reported: false,
            });
        }
        self.canonical_import(skip_write_config_files, ids)
    }

    fn canonical_import(
        self,
        skip_write_config_files: bool,
        ids: &[String],
    ) -> io::Result<ImportErrors> {
        let receipt = canonical::call(
            &self.host,
            &self.info,
            "installImportWriter",
            &json!({"ids":ids,"skipWriteConfigFiles":skip_write_config_files}),
        )?;
        self.print_host_output();
        let installation = match &receipt["error"] {
            Value::Null => None,
            Value::String(error) => Some(error.clone()),
            _ => return Err(io::Error::other("published ComponentWriter installation receipt")),
        };
        let receipt = self.host.call("installCanonicalFinalize", &json!({}))?;
        self.print_host_output();
        let compilation = match &receipt["error"] {
            Value::Null => None,
            Value::String(error) => Some(error.clone()),
            _ => {
                return Err(io::Error::other(
                    "published ComponentWriter.compileGracefully receipt",
                ));
            }
        };
        Ok(ImportErrors { installation, compilation, installation_reported: true })
    }

    /// Merge calls `InstallMain.install` without a supplied dependency graph.
    pub fn install_merge(self, root: &Path) -> io::Result<()> {
        self.run_ordered(
            root,
            false,
            None,
            &[],
            &json!({
                "dedupe":true,"updateExisting":false,"import":false,
            }),
            false,
        )
    }

    fn run_ordered(
        self,
        root: &Path,
        skip_write_config_files: bool,
        dependencies_graph: Option<Value>,
        workspace_component_order: &[String],
        canonical: &Value,
        writer: bool,
    ) -> io::Result<()> {
        let options = InstallOptions {
            programmatic: true,
            skip_import: true,
            skip_write_config_files,
            dependencies_graph,
            workspace_component_order: workspace_component_order.to_vec(),
            dependency_cache_initialized: self.cache_initialized,
            ..InstallOptions::default()
        };
        self.run_options(root, options, canonical, writer)
    }

    fn run_options(
        self,
        root: &Path,
        options: InstallOptions,
        canonical: &Value,
        writer: bool,
    ) -> io::Result<()> {
        // Keep the Host that the parent command started. A configured provider
        // may have registered callbacks during its VCS lifecycle, including
        // after an onLoad; read the live slots before native installation work.
        if self.canonical_needed(root) {
            return self.run_canonical(canonical, writer);
        }
        let input = Input::Options(Box::new(options));
        match install::run_install(root.to_path_buf(), input, self.info, self.host)?? {
            Outcome::Installed(_) | Outcome::Skipped => Ok(()),
            Outcome::Help | Outcome::Unsupported => {
                Err(io::Error::other("the workspace's package manager is not supported"))
            }
        }
    }

    fn canonical_needed(&self, root: &Path) -> bool {
        if self.info.canonical_only {
            return true;
        }
        if Self::needs_canonical(root) {
            return true;
        }
        let core_ids: Vec<String> = match serde_json::from_str(include_str!(
            "../../../../scopes/harmony/testing/load-aspect/core-aspects-ids.json"
        )) {
            Ok(ids) => ids,
            Err(_) => return true,
        };
        let result = self.host.call("installCanonicalNeeded", &json!({"coreIds":core_ids}));
        self.print_host_output();
        result.map_or(true, |value| value != false)
    }

    fn print_host_output(&self) {
        let stdout = self.host.take_stdout();
        if !self.info.non_interactive {
            print!("{stdout}");
        }
    }

    fn run_canonical(&self, options: &Value, writer: bool) -> io::Result<()> {
        let receipt = canonical::call(
            &self.host,
            &self.info,
            "installCanonical",
            &json!({"options":options,"writer":writer,"loaderText":Output::retained_text()}),
        );
        self.print_host_output();
        let receipt = receipt?;
        match &receipt["error"] {
            Value::Null => Ok(()),
            Value::String(error) => {
                if receipt["loaderStarted"] == false {
                    Output::external_loader_off();
                }
                Err(io::Error::other(error.clone()))
            }
            _ => Err(io::Error::other("published InstallMain.install receipt")),
        }
    }
}
