//! Unit tests for concurrent snapshot [`User`] author identity resolution and caching in [`Cache`] receipts.
//!
//! Verifies once-only [`Cache::load`] resolution and fresh timestamp allocation per log entry.

use super::{Cache, User};
use std::{
    io,
    sync::atomic::{AtomicUsize, Ordering},
    thread,
    time::Duration,
};

/// Verifies [`Cache::load`] resolves [`User`] identity once while allocating fresh timestamps per [`User::log`] entry.
#[test]
fn resolved_identity_is_stable_and_logs_keep_independent_messages() {
    let cache = Cache::new();
    let first = cache
        .load(|| Ok(User { username: Some("first".into()), email: None }))
        .unwrap();
    let second = cache
        .load(|| panic!("identity is already resolved"))
        .unwrap();
    assert_eq!(first.username, second.username);
    assert_eq!(first.email, second.email);
    let mut log = first.log();
    thread::sleep(Duration::from_millis(20));
    assert_ne!(log["date"], second.log()["date"]);
    log["message"] = serde_json::json!("changed");
    assert_eq!(second.log()["message"], "");
    assert!(
        second.log()["date"]
            .as_str()
            .unwrap()
            .parse::<u128>()
            .is_ok(),
    );
}

/// Verifies that [`Cache::load`] retains an initial factory error across subsequent calls without re-invoking the closure.
#[test]
fn initialization_failure_is_retained_like_a_rejected_identity_promise() {
    let cache = Cache::new();
    let first =
        cache.load(|| Err(io::Error::new(io::ErrorKind::PermissionDenied, "identity read")));
    let second = cache.load(|| panic!("failed initialization must not run again"));
    for result in [first, second] {
        let Err(error) = result else { panic!("identity initialization succeeded unexpectedly") };
        assert_eq!(error.kind(), io::ErrorKind::PermissionDenied);
        assert_eq!(error.to_string(), "identity read");
    }
}

/// Verifies that concurrent [`Cache::load`] calls invoke the [`fallback`] factory only once.
#[test]
fn concurrent_identity_requests_run_one_factory_including_cloud_lookup_fallback() {
    let cache = Cache::new();
    let calls = AtomicUsize::new(0);
    thread::scope(|scope| {
        let handles = (0..8)
            .map(|_| scope.spawn(|| fallback(&cache, &calls)))
            .collect::<Vec<_>>();
        for handle in handles {
            assert_eq!(
                handle
                    .join()
                    .unwrap()
                    .username
                    .as_deref(),
                Some("configured fallback"),
            );
        }
    });
    assert_eq!(calls.load(Ordering::Relaxed), 1);
}

/// Resolves a fallback [`User`] from `cache` while incrementing `calls` on factory execution.
fn fallback(cache: &Cache, calls: &AtomicUsize) -> User {
    cache
        .load(|| {
            calls.fetch_add(1, Ordering::Relaxed);
            Ok(User {
                username: Some("configured fallback".into()),
                email: Some("ci@example.test".into()),
            })
        })
        .unwrap()
}

/// Verifies that [`User::log`] embeds `username` and `email` fields when both are present on [`User`].
#[test]
fn user_log_embeds_email_when_present() {
    let user = User { username: Some("alice".into()), email: Some("alice@example.test".into()) };
    let log = user.log();
    assert_eq!(log["username"], "alice");
    assert_eq!(log["email"], "alice@example.test");
}
