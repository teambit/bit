//! Validate all read receipts before publishing capture caches and history.
//!
//! [`commit`] publishes [`Capture`] dependency caches and staged history records through [`Engine`] and [`fresh`].

#[cfg(test)]
#[path = "commit_tests.rs"]
mod tests;

use super::{Capture, Engine, Path, Value, array, decline, fresh, io, json};

/// Commits `capture` (`capture.commit()`): validates read receipts and staged histories, writes dependency caches, then writes histories.
pub fn commit(
    engine: &mut Engine,
    root: &Path,
    context: &Value,
    capture: &Capture,
) -> io::Result<()> {
    engine.validate_read_set(&capture.cache.environment_reads, "environment facts changed")?;
    let plans = array(context.get("pendingHistory"), "history plans")?;
    if !plans.is_empty() {
        let validated: Value = engine.request(
            &json!({"kind": "statusHistoryValidate", "root": root, "plans": plans}),
        )?;
        if validated["fresh"] != true {
            return Err(decline("status history changed"));
        }
    }
    if capture.environment_facts["importDependencyCachePublished"] != true
        && !capture.cache.is_empty()
    {
        commit_pending_cache(engine, root, capture)?;
    }
    if plans.is_empty() {
        return Ok(());
    }
    let committed: Value =
        engine.request(&json!({"kind": "statusHistoryCommit", "root": root, "plans": plans}))?;
    let written = committed.get("written").and_then(Value::as_u64);
    if committed["ok"] == false || written.is_none_or(|written| written > plans.len() as u64) {
        return Err(decline("status history commit receipt"));
    }
    Ok(())
}

/// Publishes pending dependency cache entries from `capture` through [`fresh::commit`].
#[inline]
fn commit_pending_cache(engine: &mut Engine, root: &Path, capture: &Capture) -> io::Result<()> {
    let entries = capture.cache.entries();
    let reset = checkout_reset(capture);
    if !entries.is_empty() || reset {
        fresh::commit(engine, root, &entries, reset, !capture.cache.no_fs_cache)?;
    }
    Ok(())
}

/// `DependencyLoader` saves successful reads before checkout validates merge conflicts.
pub fn commit_checkout_dependencies(
    engine: &mut Engine,
    root: &Path,
    capture: &Capture,
) -> io::Result<()> {
    if capture.cache.callbacks.host.is_none() || capture.cache.is_empty() {
        return Ok(());
    }
    let entries = capture.cache.entries();
    if !entries.is_empty() {
        // The retained loader can invalidate the old cache and publish a fresh
        // environment entry after capture's initial reset decision. Keep that
        // published entry when the workspace is no longer stale.
        let reset = checkout_reset(capture);
        fresh::commit(engine, root, &entries, reset, !capture.cache.no_fs_cache)?;
    }
    Ok(())
}

/// Published `DependenciesLoader.load` saves eligible data before Harmony's onLoad slots.
pub(super) fn publish_import_dependencies(
    engine: &mut Engine,
    root: &Path,
    capture: &mut Capture,
) -> io::Result<()> {
    crate::commands::add::restrict_dependency_cache(root, capture);
    engine.validate_read_set(&capture.dependency_read_set(), "import dependency facts changed")?;
    if !capture.cache.is_empty() {
        let entries = capture.cache.entries();
        if !entries.is_empty() || capture.cache.reset {
            fresh::commit(engine, root, &entries, capture.cache.reset, !capture.cache.no_fs_cache)?;
        }
    }
    // Keep every retained read proof and immutable pending entry, without publishing twice.
    capture.environment_facts["importDependencyCachePublished"] = json!(true);
    Ok(())
}

/// Returns `true` when checkout should reset the whole dependency cache on [`commit`].
#[inline]
fn checkout_reset(capture: &Capture) -> bool {
    capture.cache.reset && capture.environment_facts["checkoutLoaderCacheChecked"] != true
}
