use super::{Retained, bitmap};
use serde_json::{Value, json};
use std::{fs, path::Path};

fn prepare(root: &Path, publish_checkout: bool) -> (bitmap::Prepared, Retained) {
    fs::create_dir_all(root.join(".bit")).unwrap();
    let original = serde_json::to_vec(&json!({"a":{"name":"a","scope":"s",
        "version":"0.0.1","rootDir":"a","mainFile":"index.js"},"$schema-version":"17.0.0",
        "_bit_lane":{"id":{"name":"old","scope":"s"},"exported":true}}))
    .unwrap();
    fs::write(root.join(".bitmap"), &original).unwrap();
    let context = json!({"lane":{"currentId":{"name":"old","scope":"s"},
        "switchId":{"name":"new","scope":"s"},"switchExported":true,
        "switchLaneOnly":[],"switchLaneHeads":{"s/a":"head"},"switchSelectedIds":["s/a"]}});
    let updates = [bitmap::Update {
        identity: "s/a".into(),
        version: "0.0.2".into(),
        main_file: "index.js".into(),
        keep_ours: false,
    }];
    let mut first = bitmap::prepare_bytes(root, original, &context, &updates, &[]).unwrap();
    let bitmap = first.switch_continuation(&context, publish_checkout).unwrap();
    let retained = Retained { root: root.to_owned(), bitmap, tracking: None, applied: false };
    (first, retained)
}
fn read(root: &Path) -> Value {
    crate::recovery::jsonc::parse(&fs::read(root.join(".bitmap")).unwrap()).unwrap()
}
#[test]
fn checkout_and_lane_finalization_have_distinct_preimages_and_reasons() {
    let directory = tempfile::tempdir().unwrap();
    let root = directory.path();
    let (first, mut retained) = prepare(root, true);
    assert!(retained.commit("2026-10-18-1-2-2").is_err());
    first.commit("2026-10-18-1-2-3", "checkout").unwrap();
    let intermediate = fs::read(root.join(".bitmap")).unwrap();
    assert_eq!(read(root)["_bit_lane"]["id"]["name"], "old");
    assert_eq!(read(root)["a"]["version"], "0.0.2");
    retained.published().unwrap();
    fs::create_dir_all(root.join(".bitTmp")).unwrap();
    fs::write(root.join(".bitTmp/output"), b"temporary").unwrap();
    retained.commit("2026-10-18-1-2-4").unwrap();
    assert_eq!(read(root)["_bit_lane"]["id"]["name"], "new");
    assert_eq!(
        fs::read(root.join(".bit/bitmap-history/.bitmap-2026-10-18-1-2-4")).unwrap(),
        intermediate,
    );
    assert_eq!(
        fs::read_to_string(root.join(".bit/bitmap-history-metadata.txt")).unwrap(),
        "2026-10-18-1-2-3 checkout\n2026-10-18-1-2-4 lane-switch\n",
    );
    assert!(!root.join(".bitTmp").exists());
}
#[test]
fn changed_intermediate_bitmap_cannot_be_rebased_or_finalize_the_lane() {
    let directory = tempfile::tempdir().unwrap();
    let root = directory.path();
    let (first, mut retained) = prepare(root, true);
    first.commit("2026-10-18-1-2-3", "checkout").unwrap();
    retained.published().unwrap();
    let mut changed = read(root);
    changed["a"]["config"] = json!({"provider":"unacknowledged"});
    let bytes = serde_json::to_vec(&changed).unwrap();
    fs::write(root.join(".bitmap"), &bytes).unwrap();
    assert!(retained.commit("2026-10-18-1-2-4").is_err());
    assert_eq!(fs::read(root.join(".bitmap")).unwrap(), bytes);
    assert_eq!(read(root)["_bit_lane"]["id"]["name"], "old");
    assert!(!root.join(".bit/bitmap-history/.bitmap-2026-10-18-1-2-4").exists());
}

#[test]
fn completion_rejects_unowned_installer_write_receipts_before_any_publication() {
    let input = super::Complete {
        token: "unknown".into(),
        file_id: "2026-10-18-1-2-3".into(),
        owned_workspace_writes: vec![json!({"path":"/unowned","beforeHash":null,"afterHash":null})],
    };
    let error = super::complete(&input, &mut super::State::default()).unwrap_err();
    assert_eq!(error.to_string(), "switch completion has no acknowledged installer bitmap writes");
}

#[test]
fn keep_ours_updates_only_the_final_bitmap_without_a_component_writer_stage() {
    let directory = tempfile::tempdir().unwrap();
    let root = directory.path();
    let (first, mut retained) = prepare(root, false);
    let original = fs::read(root.join(".bitmap")).unwrap();
    first.commit("2026-10-18-1-2-3", "checkout").unwrap();
    assert_eq!(fs::read(root.join(".bitmap")).unwrap(), original);
    assert!(!root.join(".bit/bitmap-history-metadata.txt").exists());
    retained.published().unwrap();
    retained.commit("2026-10-18-1-2-4").unwrap();
    assert_eq!(read(root)["a"]["version"], "0.0.2");
    assert_eq!(read(root)["_bit_lane"]["id"]["name"], "new");
    assert_eq!(
        fs::read_to_string(root.join(".bit/bitmap-history-metadata.txt")).unwrap(),
        "2026-10-18-1-2-4 lane-switch\n",
    );
}
