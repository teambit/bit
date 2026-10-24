use super::Plan;
use serde_json::json;
use std::{
    fs,
    sync::atomic::{AtomicU64, Ordering},
};

static NEXT: AtomicU64 = AtomicU64::new(0);

#[test]
fn clears_only_unexported_bitmap_versions_and_rejects_a_stale_plan() {
    let serial = NEXT.fetch_add(1, Ordering::Relaxed);
    let root =
        std::env::temp_dir().join(format!("bit-reset-never-test-{}-{serial}", std::process::id()));
    fs::create_dir_all(root.join(".bit/objects")).expect("scope");
    fs::write(
        root.join(".bitmap"),
        crate::inspection::render_bitmap(&json!({
            "alpha":{"name":"alpha","scope":"","defaultScope":"scope","version":"1.0.0",
                "mainFile":"index.js","rootDir":"alpha"},
            "beta":{"name":"beta","scope":"scope","version":"2.0.0",
                "mainFile":"index.js","rootDir":"beta"},
            "$schema-version":"17.0.0",
        }))
        .expect("render"),
    )
    .expect("bitmap");
    let plan = Plan::prepare(&root).expect("plan");
    let stale = Plan::prepare(&root).expect("stale plan");
    assert_eq!(plan.labels, vec!["scope/alpha@1.0.0"]);
    plan.commit("2026-10-15-8-30-3").expect("commit");
    let bitmap = crate::recovery::jsonc::parse(&fs::read(root.join(".bitmap")).expect("bitmap"))
        .expect("parse");
    assert_eq!(bitmap["alpha"]["version"], "");
    assert_eq!(bitmap["beta"]["version"], "2.0.0");
    assert!(stale.commit("2026-10-15-8-30-4").is_err());
    fs::remove_dir_all(root).expect("remove fixture");
}
