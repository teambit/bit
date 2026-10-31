//! Validate all read receipts before publishing capture caches and history.

#[cfg(test)]
#[path = "commit_tests.rs"]
mod tests;

use super::{Capture, Engine, Path, Value, array, decline, fresh, io, json};

/// `capture.commit()`: staged histories validated, dependency caches written,
/// then the histories written.
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
        if validated.get("fresh") != Some(&Value::Bool(true)) {
            return Err(decline("status history changed"));
        }
    }
    if capture.environment_facts["importDependencyCachePublished"] != true
        && !capture.cache.is_empty()
    {
        let entries = capture.cache.entries();
        let reset = checkout_reset(capture);
        fresh::commit(engine, root, &entries, reset, !capture.cache.no_fs_cache)?;
    }
    if plans.is_empty() {
        return Ok(());
    }
    let committed: Value =
        engine.request(&json!({"kind": "statusHistoryCommit", "root": root, "plans": plans}))?;
    let written = committed.get("written").and_then(Value::as_u64);
    if committed.get("ok") == Some(&Value::Bool(false))
        || written.is_none_or(|written| written > plans.len() as u64)
    {
        return Err(decline("status history commit receipt"));
    }
    Ok(())
}

/// `DependencyLoader` saves successful reads before checkout validates merge conflicts.
pub fn commit_checkout_dependencies(
    engine: &mut Engine,
    root: &Path,
    capture: &Capture,
) -> io::Result<()> {
    if capture.cache.callbacks.host.is_some() && !capture.cache.is_empty() {
        let entries = capture.cache.entries();
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
        fresh::commit(engine, root, &entries, capture.cache.reset, !capture.cache.no_fs_cache)?;
    }
    // Keep every retained read proof and immutable pending entry, without publishing twice.
    capture.environment_facts["importDependencyCachePublished"] = json!(true);
    Ok(())
}

fn checkout_reset(capture: &Capture) -> bool {
    capture.cache.reset && capture.environment_facts["checkoutLoaderCacheChecked"] != true
}
