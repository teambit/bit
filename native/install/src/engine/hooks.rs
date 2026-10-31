//! Bit's `readPackage` hooks (`createReadPackageHooks` in `lynx.ts`),
//! implemented natively.
//!
//! The hooks are recorded in the lockfile as `pnpmfileChecksum: bit-1`, exactly
//! like the TypeScript integration (`readPackageHookChecksum` wraps its
//! JavaScript hook in `@pnpm/napi`'s `ChecksummedHooks`), so both produce and
//! reuse the same lockfiles.

#[cfg(test)]
mod tests;

use super::READ_PACKAGE_HOOKS_CHECKSUM;
use async_trait::async_trait;
use indexmap::IndexMap;
use pnpm_hooks::{
    HookContext, HookError, PnpmfileHooks, PreResolutionHookContext, PreResolutionHookLogger,
    ReadPackageResult,
};
use serde_json::{Map, Value};
use std::{
    collections::HashMap,
    path::{Component, Path, PathBuf},
    sync::Arc,
};

/// The root components directory, `.bit_roots`.
const BIT_ROOTS_DIR: &str = ".bit_roots";

/// Bit's hook chain plus what it needs to transform dependency manifests.
#[derive(Debug, Default, Clone)]
pub(super) struct BitHooks {
    pub root: PathBuf,
    /// `rootComponents`: workspace projects drop their `workspace:` deps.
    pub root_components: bool,
    /// A `@teambit/harmony` version is forced, so harmony is kept.
    pub forced_harmony: bool,
    /// Packages whose `scripts` are removed (`removeScriptsFromNeverBuiltPackages`).
    pub never_build: Vec<String>,
    /// Raw (un-hooked) project manifests by normalized absolute dir. An
    /// injected project resolved as a dependency gets its raw manifest, so its
    /// workspace-sibling dependencies survive.
    pub raw_manifests: HashMap<PathBuf, Value>,
}

impl BitHooks {
    /// The chain applied to one manifest. `workspace_dir` is set only for
    /// workspace projects.
    pub(super) fn apply(&self, manifest: Value, workspace_dir: Option<&Path>) -> Value {
        let Value::Object(mut manifest) = manifest else { return manifest };
        if self.root_components
            && let Some(dir) = workspace_dir
            && !dir.to_string_lossy().contains(BIT_ROOTS_DIR)
        {
            read_workspace_package(&mut manifest);
        }
        remove_linked_only(&mut manifest, "@teambit/legacy");
        if !self.forced_harmony {
            remove_linked_only(&mut manifest, "@teambit/harmony");
        }
        Value::Object(manifest)
    }

    /// `readPackageHookForDeps`.
    pub(super) fn dependency_manifest(&self, manifest: Value, resolved_dir: Option<&str>) -> Value {
        let raw = resolved_dir
            .map(str::trim)
            .filter(|dir| !dir.is_empty())
            .and_then(|dir| self.raw_manifests.get(&normalize(&self.root.join(dir))));
        let manifest = self.apply(raw.cloned().unwrap_or(manifest), None);
        self.remove_never_built_scripts(manifest)
    }

    fn remove_never_built_scripts(&self, mut manifest: Value) -> Value {
        if let Some(object) = manifest.as_object_mut()
            && let Some(name) = object
                .get("name")
                .and_then(Value::as_str)
                .map(str::trim)
            && !name.is_empty()
            && self.never_build
                .iter()
                .any(|never| never.trim() == name)
        {
            object.remove("scripts");
        }
        manifest
    }
}

/// Remove workspace-project deps (Bit links those itself) and fold the peers
/// into the dependencies (`readWorkspacePackageHook`).
fn read_workspace_package(manifest: &mut Map<String, Value>) {
    let mut dependencies: IndexMap<String, Value> =
        object_entries(manifest.get("peerDependencies"));
    for (name, version) in object_entries(manifest.get("dependencies")) {
        if !version
            .as_str()
            .is_some_and(|version| version.starts_with("workspace:"))
        {
            dependencies.insert(name, version);
        }
    }
    manifest.insert("dependencies".to_string(), Value::Object(dependencies.into_iter().collect()));
}

fn object_entries(value: Option<&Value>) -> IndexMap<String, Value> {
    value
        .and_then(Value::as_object)
        .map(|object| {
            object
                .iter()
                .map(|(key, value)| (key.clone(), value.clone()))
                .collect()
        })
        .unwrap_or_default()
}

/// `@teambit/legacy` / `@teambit/harmony` are linked from bvm: drop them from
/// `dependencies` unless linked, and always from `peerDependencies`.
fn remove_linked_only(manifest: &mut Map<String, Value>, name: &str) {
    let is_set = |value: &Value| {
        value
            .as_str()
            .is_some_and(|value| !value.is_empty())
    };
    if let Some(Value::Object(dependencies)) = manifest.get_mut("dependencies")
        && dependencies
            .get(name)
            .is_some_and(|version| {
                is_set(version)
                    && !version
                        .as_str()
                        .is_some_and(|version| version.starts_with("link:"))
            })
    {
        dependencies.remove(name);
    }
    if let Some(Value::Object(peers)) = manifest.get_mut("peerDependencies")
        && peers.get(name).is_some_and(is_set)
    {
        peers.remove(name);
    }
}

/// Lexically normalize an absolute path (`path.join` semantics).
pub(super) fn normalize(path: &Path) -> PathBuf {
    let mut normalized = PathBuf::new();
    for component in path.components() {
        match component {
            Component::CurDir => {}
            Component::ParentDir => {
                normalized.pop();
            }
            other => normalized.push(other.as_os_str()),
        }
    }
    normalized
}

#[async_trait]
impl PnpmfileHooks for BitHooks {
    async fn read_package(
        &self,
        pkg: Value,
        ctx: HookContext,
    ) -> Result<ReadPackageResult, HookError> {
        Ok(Arc::new(self.dependency_manifest(pkg, ctx.dir.as_deref())))
    }

    async fn after_all_resolved(
        &self,
        _lockfile: Value,
        _ctx: HookContext,
    ) -> Result<Value, HookError> {
        // Null: there is no `afterAllResolved` hook; keep the lockfile.
        Ok(Value::Null)
    }

    async fn pre_resolution(
        &self,
        ctx: PreResolutionHookContext,
        _logger: PreResolutionHookLogger,
    ) -> Result<PreResolutionHookContext, HookError> {
        Ok(ctx)
    }

    async fn filter_log(&self, _log: Value, _ctx: HookContext) -> bool {
        true
    }

    async fn has_read_package(&self) -> Result<bool, HookError> {
        Ok(true)
    }

    /// Tracked by [`READ_PACKAGE_HOOKS_CHECKSUM`], so a lockfile resolved with
    /// the same hooks is reused instead of resolved again.
    async fn untracked_read_package_hook(&self) -> Result<Option<bool>, HookError> {
        Ok(None)
    }

    async fn calculate_pnpmfile_checksum(&self) -> Option<String> {
        Some(READ_PACKAGE_HOOKS_CHECKSUM.to_string())
    }
}
