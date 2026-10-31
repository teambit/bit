use super::{Cache, User};
use std::{
    io,
    sync::atomic::{AtomicUsize, Ordering},
    thread,
    time::Duration,
};

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
