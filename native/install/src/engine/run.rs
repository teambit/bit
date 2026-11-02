//! One engine install (`lynx.install`): the `bit:` lockfile block and the
//! `--update` lockfile handling around [`engine_call`], which runs `pacquet`'s
//! `Install` on a dedicated thread.
//!
//! Guards virtual-store layout transitions and serializes process-wide engine invocations via [`engine_call_lock`].

mod engine_call;
#[cfg(test)]
mod tests;

use super::{
    EngineInstallOptions, EngineResult, EngineSettings, lockfile_attrs, restore,
    virtual_store_guard,
};
use crate::model::InstallPlan;
use engine_call::EngineCall;
use std::{io, sync::OnceLock};
use tokio::sync::Mutex;

/// Serializes every engine call of the process: the reporter and stats slots
/// are process-global, and Bit serializes installs per workspace anyway.
#[inline]
pub(super) fn engine_call_lock() -> &'static Mutex<()> {
    static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
    LOCK.get_or_init(|| Mutex::new(()))
}

/// Execute the package installation for `plan` with `settings` and `options`.
pub async fn install(
    plan: &InstallPlan,
    settings: &EngineSettings,
    options: &EngineInstallOptions,
) -> io::Result<EngineResult> {
    let root = &settings.root;
    virtual_store_guard::assert_safe_transition(
        root,
        settings.layout.enable_global_virtual_store,
        &settings.layout.bit_dir,
    )?;
    let _guard = engine_call_lock().lock().await;
    if let Some(restore) = &options.restore {
        restore::write_lockfile(restore, plan, settings).await?;
    }
    let pre_install_attrs = lockfile_attrs::read(root);
    let removed_lockfile = lockfile_attrs::remove_for_update(root, options.update_all)?;
    let outcome = EngineCall::new(plan, settings, options).spawn().await;
    let outcome = match outcome {
        Ok(outcome) => outcome,
        Err(error) => {
            let _ = lockfile_attrs::restore_after_failure(root, removed_lockfile);
            return Err(error);
        }
    };
    let deps_requiring_build = outcome.deps_requiring_build.map(normalize_deps_requiring_build);
    if let Some(attrs) = lockfile_attrs::merge(pre_install_attrs, deps_requiring_build.as_deref()) {
        lockfile_attrs::write(root, attrs)?;
    }
    let store_dir = if outcome.store_dir.as_os_str().is_empty() {
        settings.store.store_dir.clone()
    } else {
        outcome.store_dir
    };
    Ok(EngineResult {
        dependencies_changed: outcome.added.saturating_add(outcome.removed) > 0,
        deps_requiring_build,
        store_dir,
    })
}

/// Filter empty strings, sort, and deduplicate the `depsRequiringBuild` package list `deps` in place.
#[inline]
fn normalize_deps_requiring_build(mut deps: Vec<String>) -> Vec<String> {
    deps.retain(|dep| !dep.trim().is_empty());
    deps.sort_unstable();
    deps.dedup();
    deps
}
