use super::{Engine, checkout_reset, fresh};
use crate::commands::status::capture::{CacheWrites, Capture};
use bit_install::dependencies::cache::{invalidation::deps_dir, put};
use serde_json::json;
use std::{
    collections::HashMap,
    fs,
    time::{Duration, SystemTime},
};

fn capture(loader_checked: bool) -> Capture {
    Capture {
        captured: Vec::new(),
        comparisons: Vec::new(),
        components: Vec::new(),
        environment_facts: json!({"checkoutLoaderCacheChecked":loader_checked}),
        remotely_removed: Vec::new(),
        invalid: HashMap::new(),
        dependency_states: HashMap::new(),
        cache: CacheWrites { reset: true, ..CacheWrites::default() },
    }
}

#[test]
fn checkout_commit_keeps_the_entry_written_by_the_retained_loader_after_invalidation() {
    let workspace = tempfile::tempdir().unwrap();
    let root = workspace.path();
    let cache = deps_dir(root);
    let id = "scope/env/provider@0.0.1";
    let bitmap = root.join(".bitmap");
    fs::write(&bitmap, "{}").unwrap();
    fs::File::options()
        .write(true)
        .open(&bitmap)
        .unwrap()
        .set_modified(SystemTime::now() + Duration::from_hours(1))
        .unwrap();
    // The published loader checked invalidation and saved the env's real
    // detection. A later bitmap timestamp cannot start a second reset.
    put(&cache, id, "actual loader entry").unwrap();
    let mut engine = Engine::new().unwrap();
    let checked = capture(true);
    fresh::commit(&mut engine, root, &[], checkout_reset(&checked), true).unwrap();
    // Checkout publishes the same capture once before planning and again
    // immediately before applying the workspace write.
    fresh::commit(&mut engine, root, &[], checkout_reset(&checked), true).unwrap();
    let saved = bit_object_import::read_dependency_cache(&cache, id).unwrap().unwrap();
    assert_eq!(saved["data"], "actual loader entry");
    fresh::commit(&mut engine, root, &[], checkout_reset(&capture(false)), true).unwrap();
    assert!(!cache.exists());
}
