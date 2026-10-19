//! The JavaScript host. Only behavior that components or aspects implement in
//! JavaScript goes through it; everything else is computed natively.

use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{io, path::PathBuf};

/// Facts about the running `bit` process, collected once by the JavaScript entry point.
#[derive(Debug, Default, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(
    dylint_lib = "perfectionist",
    expect(
        perfectionist::too_many_struct_fields,
        reason = "One flat record of process facts serialized from JavaScript."
    )
)]
pub struct HostInfo {
    /// `@teambit/bit` package dir of the running bit (`mainAspect.path`).
    pub bit_dir: PathBuf,
    /// `<bvm>/versions/<v>/bit-<v>` when bit runs from bvm.
    pub bvm_dir: Option<PathBuf>,
    /// Core aspects: `[aspect id, package name, package dir]`.
    pub core_aspects: Vec<CoreAspect>,
    /// Non-aspect core packages linked like aspects (`@teambit/legacy`, `@teambit/harmony`).
    pub core_packages: Vec<CoreAspect>,
    /// `process.execPath`.
    pub node_path: PathBuf,
    /// Bit's global config dir (`GLOBAL_CONFIG`).
    pub global_config_dir: PathBuf,
    /// The running bit version.
    pub bit_version: String,
    /// Terminal columns, when stdout is a TTY.
    pub columns: Option<u32>,
    pub color: bool,
    /// Bit's loader is on (`BIT_DISABLE_SPINNER` unset). Without it, status and
    /// success lines are not printed until the package manager step turns it on.
    pub loader: bool,
    /// `logger.shouldWriteToConsole`: console lines print while the loader is off.
    /// Unset, it follows `loader`, as `CommandRunner` sets both together.
    #[serde(default)]
    pub write_to_console: Option<bool>,
    /// The process runs with `--json`/non-interactive output.
    pub non_interactive: bool,
    /// Static workspace preflight proved that installation must stay on the
    /// retained published class; native linker facts were intentionally omitted.
    #[serde(default)]
    pub canonical_only: bool,
    /// `currentDateAndTimeToFileName()` at command start: names the
    /// `workspace.jsonc` backup in local time.
    pub file_id: String,
    /// `node_modules/.pnpm` directory names the host process loaded modules
    /// from (`loadedVirtualStoreDirNames`): never pruned by this install.
    #[serde(default)]
    pub loaded_virtual_store_dirs: Vec<String>,
    /// `--token`: the bearer token for remote requests, over `user.token`
    /// (`globalFlags.token` in `Http.getToken`).
    #[serde(default)]
    pub token: Option<String>,
}

#[derive(Debug, Default, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CoreAspect {
    pub id: String,
    pub package_name: String,
    pub dir: PathBuf,
}

/// Work handed back to JavaScript after the packages are installed and linked.
#[derive(Debug, Default, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AfterInstall {
    pub compile: bool,
    pub write_config_files: bool,
    /// Some env failed to load before the install; clear caches first.
    pub clear_cache: bool,
}

#[derive(Debug, Default, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AfterInstallResult {
    /// Envs whose policy is only known after loading them (legacy envs without
    /// `env.jsonc`) that still failed to load: the recurring install trigger.
    pub old_non_loaded_envs: Vec<String>,
    /// Number of components compiled, for the summary line.
    pub compiled: usize,
    /// What compiling and writing the config files produced: the dist directories
    /// (`BuildResult.distDirs`) and the config files written. `None` when a component
    /// failed to compile, the config write failed or skipped files, or the host does not
    /// report them.
    #[serde(default)]
    pub outputs: Option<Vec<PathBuf>>,
}

/// The `detectDependencies` request: one component's files.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DetectRequest<'a> {
    /// The component's env, without version.
    pub env_id: &'a str,
    /// The component dir, absolute: the `directory` `filing-cabinet` passes a `dependencyLookup`.
    pub component_dir: String,
    pub files: Vec<String>,
    /// Workspace aspects to load first (`getNotLoadedConfiguredExtensions`, which the CLI
    /// loads on start): any of them may register a detector. Sent with the first request.
    pub aspect_ids: Vec<String>,
}

/// Callbacks implemented by JavaScript. Each is invoked only when the
/// workspace actually needs it.
#[async_trait]
pub trait Host: Send + Sync {
    /// Prepare the published node-gyp script path only when the package engine
    /// is about to run. The returned PATH belongs to child lifecycle processes.
    async fn prepare_build_scripts_path(&self) -> io::Result<Option<String>> {
        Ok(None)
    }

    /// Load the retained component classes before root linking, when the parent needs them.
    async fn initial_installation_components(&self, aspect_ids: &[String]) -> io::Result<bool> {
        let _ = aspect_ids;
        Ok(false)
    }

    /// Actual component class loads and ordered directory facts at an installation phase.
    async fn installation_components(
        &self,
        phase: &str,
        ids: &[String],
    ) -> io::Result<Option<Value>> {
        let _ = (phase, ids);
        Ok(None)
    }

    /// Invalidate retained component classes after the native linker changed package manifests.
    async fn component_links_changed(&self, ids: &[String]) -> io::Result<()> {
        let _ = ids;
        Ok(())
    }

    /// Run actual package-manager subscribers over the native installation metadata.
    async fn install_subscribers(&self, request: &Value) -> io::Result<Option<Value>> {
        let _ = request;
        Ok(None)
    }

    /// Load configured aspect classes at the root-policy phase without aggregating policy.
    async fn configured_aspect_classes(&self) -> io::Result<()> {
        Ok(())
    }

    /// Dependency policy (`EnvPolicyConfigObject`) of an env that has no
    /// `env.jsonc`: core envs and legacy envs implementing `getDependencies()`.
    /// `None` when the env cannot be loaded.
    async fn env_policy(&self, env_id: &str) -> io::Result<Option<Value>>;

    /// `getDependencies()` of `env_id` when it is already registered as an env, after
    /// loading `aspect_ids` (`getNotLoadedConfiguredExtensions`, which the CLI loads on
    /// start): `getEnvDefinitionById` of `getEnvPolicyFromEnvId`, which never loads the
    /// component as an aspect. `None` when it is not a registered env.
    async fn registered_env_policy(
        &self,
        env_id: &str,
        aspect_ids: &[String],
    ) -> io::Result<Option<Value>> {
        let _ = aspect_ids;
        self.env_policy(env_id).await
    }

    /// File patterns of registered application types, used to find apps.
    async fn app_types(&self) -> io::Result<Vec<String>>;

    /// Dev-file patterns an env implements in JavaScript:
    /// `{ devPatterns, tests, docs, compositions }`, the env's `getDevPatterns()`,
    /// `getTestsDevPatterns()`, `getDocsDevPatterns()` and `getCompositionsDevPatterns()`
    /// (each `null` when the env does not implement it). `None` when the env
    /// cannot be loaded.
    async fn dev_patterns(&self, env_id: &str) -> io::Result<Option<Value>> {
        let _ = env_id;
        Ok(None)
    }

    /// The component loads `InstallMain.install` performs before the manifests, after
    /// loading `aspect_ids` (`getNotLoadedConfiguredExtensions`). Until the package manager
    /// ran (`after_install`), the env requests see only the envs this registered: an env
    /// it did not register is the default env (`calculateEnv`), and no extension is loaded.
    async fn prepare_install(&self, aspect_ids: &[String]) -> io::Result<()> {
        let _ = aspect_ids;
        Ok(())
    }

    /// Whether `env_id` resolves to the default env: before the package manager, an env
    /// the install's component loads did not register (see `prepare_install`).
    async fn env_falls_back(&self, env_id: &str) -> io::Result<bool> {
        let _ = env_id;
        Ok(false)
    }

    /// The dependency policies aspects registered (`registerDependenciesPolicies`),
    /// as `[[registrar, policy], ...]`, after loading `extension_ids`: the aspects the
    /// components configure that may register one. `None` when the host cannot load them.
    async fn dependency_policies(&self, extension_ids: &[String]) -> io::Result<Option<Value>> {
        let _ = extension_ids;
        Ok(None)
    }

    /// What custom detectors find in `request.files` (absolute paths) of a component of
    /// `request.env_id` (`detectWithCustomDetectors` of `@teambit/dependency-resolver`): per
    /// file the first env detector (`getDepDetectors()`) supporting it, else the first
    /// detector an aspect registered (`registerDetector`) that Rust does not replicate. The
    /// result is `{ "<file>": { dependencies, typescript, lookups? } }` for the claimed files
    /// only. `typescript` marks a file a registered detector supports, whose imports
    /// `filing-cabinet` resolves through `lookupTypeScript`; `lookups` holds what a detector's
    /// `dependencyLookup` returned per specifier (an absolute path or `null`). `None` when
    /// neither kind of detector exists.
    async fn detect_dependencies(&self, request: &DetectRequest<'_>) -> io::Result<Option<Value>> {
        let _ = request;
        Ok(None)
    }

    /// `package.json` props of an env: `{ props, modifiesPackageJson }`, where
    /// `props` is the env's `getPackageJsonProps()` and `modifiesPackageJson`
    /// tells whether it implements `modifyPackageJson()`.
    async fn package_json_props(&self, env_id: &str) -> io::Result<Value>;

    /// Run the env's `modifyPackageJson(component, manifest)` on a generated manifest.
    async fn transform_package_json(&self, component: &str, manifest: Value) -> io::Result<Value>;

    /// Compile and write config files with the canonical JavaScript aspects.
    async fn after_install(&self, request: AfterInstall) -> io::Result<AfterInstallResult>;

    /// Ask a yes/no question on the terminal.
    async fn confirm(&self, question: &str) -> io::Result<bool>;
}
