use super::{PreparedLoad, PreparedSave, list};
use serde_json::json;
use std::{
    fs,
    path::PathBuf,
    sync::atomic::{AtomicU64, Ordering},
};
static NEXT: AtomicU64 = AtomicU64::new(0);
fn scope() -> PathBuf {
    let serial = NEXT.fetch_add(1, Ordering::Relaxed);
    let root =
        std::env::temp_dir().join(format!("bit-stash-store-{}-{serial}", std::process::id()));
    fs::create_dir_all(&root).unwrap();
    root
}
#[test]
fn lexical_latest_preserves_the_published_double_digit_rollover() {
    let scope = scope();
    let data = json!({"metadata":{"message":"saved"},"stashCompsData":[]});
    for _ in 0..11 {
        PreparedSave::prepare(&scope, &data)
            .unwrap()
            .apply()
            .unwrap();
    }
    let rows = list(&scope).unwrap();
    assert_eq!(rows.len(), 10);
    assert_eq!(rows[1]["id"], "stash-10");
    assert_eq!(rows.last().unwrap()["id"], "stash-9");
    assert_eq!(PreparedSave::prepare(&scope, &data).unwrap().filename(), "stash-10.json");
    let loaded = PreparedLoad::prepare(&scope, None).unwrap();
    loaded.consume().unwrap();
    assert!(!scope.join("stash/stash-9.json").exists());
    fs::remove_dir_all(scope).unwrap();
}
#[test]
fn save_formats_exact_metadata_and_refuses_concurrent_metadata_changes() {
    let scope = scope();
    let data = json!({"metadata":{},"stashCompsData":[]});
    let save = PreparedSave::prepare(&scope, &data).unwrap();
    let stale = PreparedSave::prepare(&scope, &data).unwrap();
    save.apply().unwrap();
    assert_eq!(
        fs::read(scope.join("stash/stash-1.json")).unwrap(),
        b"{\n    \"metadata\": {},\n    \"stashCompsData\": []\n}",
    );
    assert!(stale.apply().is_err());
    let load = PreparedLoad::prepare(&scope, Some("stash-1")).unwrap();
    fs::write(scope.join("stash/stash-1.json"), "{}").unwrap();
    assert!(load.consume().is_err());
    assert!(scope.join("stash/stash-1.json").exists());
    fs::remove_dir_all(scope).unwrap();
}
#[cfg(unix)]
#[test]
fn symbolic_metadata_is_rejected_without_touching_its_target() {
    let scope = scope();
    fs::create_dir_all(scope.join("stash")).unwrap();
    fs::write(scope.join("target"), "{}").unwrap();
    std::os::unix::fs::symlink(scope.join("target"), scope.join("stash/stash-1.json")).unwrap();
    assert!(PreparedLoad::prepare(&scope, None).is_err());
    assert!(PreparedSave::prepare(&scope, &json!({})).is_err());
    assert_eq!(fs::read(scope.join("target")).unwrap(), b"{}");
    fs::remove_dir_all(scope).unwrap();
}
#[test]
fn empty_files_cannot_bypass_the_metadata_entry_budget() {
    let scope = scope();
    fs::create_dir_all(scope.join("stash")).unwrap();
    for number in 0..4097 {
        fs::write(
            scope
                .join("stash")
                .join(format!("stash-{number}.json")),
            "",
        )
        .unwrap();
    }
    let error = PreparedSave::prepare(&scope, &json!({})).err().unwrap();
    assert_eq!(error.to_string(), "stash metadata entry count exceeds read budget");
    assert_eq!(fs::read_dir(scope.join("stash")).unwrap().count(), 4097);
    fs::remove_dir_all(scope).unwrap();
}
