use super::{Update, prepare, prepare_after, validate_history_file_id};
use serde_json::json;
use std::{
    fs,
    path::PathBuf,
    sync::atomic::{AtomicUsize, Ordering},
};
static NEXT: AtomicUsize = AtomicUsize::new(0);
struct Fixture(PathBuf);
impl Fixture {
    fn new() -> Self {
        let root = std::env::temp_dir()
            .join(format!(
                "bit-command-bitmap-{}-{}",
                std::process::id(),
                NEXT.fetch_add(1, Ordering::Relaxed),
            ));
        fs::create_dir_all(root.join(".bit")).unwrap();
        let bitmap = json!({"alpha":{"name":"alpha","scope":"","version":"1.0.0","defaultScope":"local.scope","mainFile":"index.js","rootDir":"alpha"},"$schema-version":"17.0.0"});
        fs::write(root.join(".bitmap"), crate::inspection::render_bitmap(&bitmap).unwrap())
            .unwrap();
        Self(root)
    }
}
impl Drop for Fixture {
    fn drop(&mut self) {
        fs::remove_dir_all(&self.0).unwrap();
    }
}
#[test]
fn bitmap_update_preserves_unexported_scope_and_records_original_backup() {
    let fixture = Fixture::new();
    let original = fs::read(fixture.0.join(".bitmap")).unwrap();
    let hash = "a".repeat(40);
    let context = json!({"models":[{"name":"alpha","scope":"local.scope","versions":{"1.1.0":hash,"1.2.0":hash}}]});
    let plan = prepare(
        &fixture.0,
        &context,
        &[Update {
            identity: "local.scope/alpha".into(),
            version: hash,
            main_file: "main.ts".into(),
            keep_ours: false,
        }],
    )
    .unwrap();
    assert_eq!(fs::read(fixture.0.join(".bitmap")).unwrap(), original);
    assert_eq!(plan.commit("2026-10-13-1-2-3", "checkout").unwrap(), None);
    assert_eq!(
        fs::read(fixture.0.join(".bit/bitmap-history/.bitmap-2026-10-13-1-2-3")).unwrap(),
        original,
    );
    assert_eq!(
        fs::read(fixture.0.join(".bit/bitmap-history-metadata.txt")).unwrap(),
        b"2026-10-13-1-2-3 checkout\n",
    );
    let result =
        crate::recovery::jsonc::parse(&fs::read(fixture.0.join(".bitmap")).unwrap()).unwrap();
    assert_eq!(result["alpha"]["version"], "1.2.0");
    assert_eq!(result["alpha"]["scope"], "");
    assert_eq!(result["alpha"]["defaultScope"], "local.scope");
}
#[test]
fn stale_bitmap_declines_before_backup_or_publication() {
    let fixture = Fixture::new();
    let plan = prepare(
        &fixture.0,
        &json!({}),
        &[Update {
            identity: "local.scope/alpha".into(),
            version: "1.1.0".into(),
            main_file: "index.js".into(),
            keep_ours: false,
        }],
    )
    .unwrap();
    fs::write(fixture.0.join(".bitmap"), b"concurrent edit").unwrap();
    assert!(plan.commit("2026-10-13-1-2-3", "checkout").is_err());
    assert!(!fixture.0.join(".bit/bitmap-history").exists());
    assert_eq!(fs::read(fixture.0.join(".bitmap")).unwrap(), b"concurrent edit");
}

#[test]
fn malformed_history_receipts_and_duplicate_updates_decline() {
    for id in ["-----", "2026--13-1-2-3", "2026-10-13-1-2-x", "2026-10-13-1-2-3/else"] {
        assert!(validate_history_file_id(id).is_err());
    }
    assert!(validate_history_file_id("2026-10-13-1-2-3").is_ok());
    let fixture = Fixture::new();
    let updates = (0..2)
        .map(|_| Update {
            identity: "local.scope/alpha".into(),
            version: "1.1.0".into(),
            main_file: "index.js".into(),
            keep_ours: false,
        })
        .collect::<Vec<_>>();
    assert!(prepare(&fixture.0, &json!({}), &updates).is_err());
    assert!(!fixture.0.join(".bit/bitmap-history").exists());
}

#[test]
fn keep_ours_preserves_raw_snap_and_skips_unchanged_bitmap_backup() {
    let fixture = Fixture::new();
    let update = Update {
        identity: "local.scope/alpha".into(),
        version: "1.0.0".into(),
        main_file: "ignored.js".into(),
        keep_ours: true,
    };
    let plan = prepare(&fixture.0, &json!({}), &[update]).unwrap();
    plan.commit("2026-10-13-1-2-3", "checkout (alpha)").unwrap();
    assert!(!fixture.0.join(".bit/bitmap-history").exists());
    let hash = "a".repeat(40);
    let context =
        json!({"models":[{"name":"alpha","scope":"local.scope","versions":{"1.2.0":hash}}]});
    let plan = prepare(
        &fixture.0,
        &context,
        &[Update {
            identity: "local.scope/alpha".into(),
            version: hash.clone(),
            main_file: "ignored.js".into(),
            keep_ours: true,
        }],
    )
    .unwrap();
    plan.commit("2026-10-13-1-2-3", "checkout (alpha)").unwrap();
    let bitmap =
        crate::recovery::jsonc::parse(&fs::read(fixture.0.join(".bitmap")).unwrap()).unwrap();
    assert_eq!(bitmap["alpha"]["version"], hash);
    assert_eq!(bitmap["alpha"]["mainFile"], "index.js");
    assert_eq!(bitmap["alpha"]["scope"], "");
    assert_eq!(bitmap["alpha"]["defaultScope"], "local.scope");
}

#[test]
fn chained_bitmap_snap_validates_and_backs_up_intermediate_map() {
    let fixture = Fixture::new();
    let first = prepare(
        &fixture.0,
        &json!({}),
        &[Update {
            identity: "local.scope/alpha".into(),
            version: "1.1.0".into(),
            main_file: "index.js".into(),
            keep_ours: false,
        }],
    )
    .unwrap();
    let second = prepare_after(
        &first,
        &json!({}),
        &[Update {
            identity: "local.scope/alpha".into(),
            version: "1.2.0".into(),
            main_file: "index.js".into(),
            keep_ours: false,
        }],
    )
    .unwrap();
    assert!(second.validate().is_err());
    first.commit("2026-10-13-1-2-3", "merge").unwrap();
    let intermediate = fs::read(fixture.0.join(".bitmap")).unwrap();
    second.commit("2026-10-13-1-2-4", "merge-snap (message: N/A)").unwrap();
    assert_eq!(
        fs::read(fixture.0.join(".bit/bitmap-history/.bitmap-2026-10-13-1-2-4")).unwrap(),
        intermediate,
    );
    let bitmap =
        crate::recovery::jsonc::parse(&fs::read(fixture.0.join(".bitmap")).unwrap()).unwrap();
    assert_eq!(bitmap["alpha"]["version"], "1.2.0");
}

#[test]
fn canonical_backup_preserves_long_multiline_reasons_verbatim() {
    let fixture = Fixture::new();
    let update = Update {
        identity: "local.scope/alpha".into(),
        version: "1.1.0".into(),
        main_file: "index.js".into(),
        keep_ours: false,
    };
    let plan = prepare(&fixture.0, &json!({}), &[update]).unwrap();
    let original = fs::read(fixture.0.join(".bitmap")).unwrap();
    let reason =
        format!("merge-snap (message: {}\nsecond line\r\n第三行)", "long message ".repeat(100));
    assert!(reason.len() > 256);
    assert!(plan.commit("../invalid", &reason).is_err());
    assert_eq!(fs::read(fixture.0.join(".bitmap")).unwrap(), original);
    assert!(!fixture.0.join(".bit/bitmap-history").exists());
    plan.commit("2026-10-13-1-2-3", &reason).unwrap();
    assert_eq!(
        fs::read(fixture.0.join(".bit/bitmap-history-metadata.txt")).unwrap(),
        format!("2026-10-13-1-2-3 {reason}\n").as_bytes(),
    );
    assert_eq!(
        fs::read(fixture.0.join(".bit/bitmap-history/.bitmap-2026-10-13-1-2-3")).unwrap(),
        original,
    );
}
