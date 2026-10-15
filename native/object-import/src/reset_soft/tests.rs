use super::Plan;
use serde_json::json;
use std::{
    fs,
    sync::atomic::{AtomicU64, Ordering},
};

static NEXT: AtomicU64 = AtomicU64::new(0);

#[test]
fn clears_all_pending_tags_and_refuses_a_stale_plan() {
    let serial = NEXT.fetch_add(1, Ordering::Relaxed);
    let root =
        std::env::temp_dir().join(format!("bit-reset-soft-test-{}-{serial}", std::process::id()));
    fs::create_dir_all(root.join(".bit")).expect("scope");
    let bitmap = crate::inspection::render_bitmap(&json!({
        "alpha":{"name":"alpha","scope":"","defaultScope":"scope","version":"1.0.0",
            "mainFile":"index.js","rootDir":"alpha","nextVersion":{"version":"2.0.0"}},
        "beta":{"name":"beta","scope":"","defaultScope":"scope","version":"1.0.0",
            "mainFile":"index.js","rootDir":"beta","nextVersion":{"version":"2.1.0"}},
        "$schema-version":"17.0.0",
    }))
    .expect("render");
    fs::write(root.join(".bitmap"), bitmap).expect("bitmap");
    let plan = Plan::prepare(&root, None).expect("plan");
    let stale = Plan::prepare(&root, None).expect("stale plan");
    assert_eq!(plan.entries.len(), 2);
    plan.commit("2026-10-15-7-17-5").expect("commit");
    let after = crate::recovery::jsonc::parse(&fs::read(root.join(".bitmap")).expect("bitmap"))
        .expect("parse");
    assert!(after["alpha"].get("nextVersion").is_none());
    assert!(after["beta"].get("nextVersion").is_none());
    assert!(stale.commit("2026-10-15-7-17-6").is_err());
    fs::remove_dir_all(root).expect("remove fixture");
}
