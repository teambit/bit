//! Unit tests for `bit set-peer` ([`parse_set_args`]) and `bit unset-peer` ([`parse_unset_args`]) [`PeerAction`] CLI parsing and [`prepare`] config mutations.
//!
//! Verifies [`DEP_RESOLVER_ID`] peer dependency policy updates and [`Chalk`] output formatting.

use super::{DEP_RESOLVER_ID, PeerAction, parse_set_args, parse_unset_args, prepare};
use crate::commands::color::Chalk;
use serde_json::{Value, json};
use std::fs;
use tempfile::tempdir;

/// Verifies `bit set-peer` and `bit unset-peer` [`PeerAction`] parsing via [`parse_set_args`] and [`parse_unset_args`].
#[test]
fn parses_set_and_unset_peer_arguments() {
    assert_eq!(
        parse_set_args(&["comp1", "^1.0.0"]),
        Some(PeerAction::Set { component_id: "comp1".into(), range: "^1.0.0".into() }),
    );
    assert_eq!(
        parse_set_args(&["comp1", "0", "--no-color"]),
        Some(PeerAction::Set { component_id: "comp1".into(), range: "0".into() }),
    );
    assert_eq!(parse_set_args(&["comp*", "^1.0.0"]), None);
    assert_eq!(parse_set_args(&["comp1"]), None);
    assert_eq!(
        parse_unset_args(&["comp1"]),
        Some(PeerAction::Unset { component_id: "comp1".into() }),
    );
    assert_eq!(parse_unset_args(&["comp1", "extra"]), None);
}

/// Verifies [`prepare`] and commit lifecycle for setting and unsetting [`DEP_RESOLVER_ID`] peer config in `.bitmap`.
#[test]
fn sets_and_unsets_peer_in_bitmap() {
    let dir = tempdir().expect("tempdir");
    fs::write(
        dir.path().join("workspace.jsonc"),
        r#"{ "teambit.workspace/workspace": { "defaultScope": "my-scope" } }"#,
    )
    .expect("write workspace.jsonc");
    fs::write(
        dir.path().join(".bitmap"),
        r#"{ "comp1": { "scope": "", "version": "", "mainFile": "index.ts", "rootDir": "comp1" }, "$schema-version": "17.0.0" }"#,
    )
    .expect("write .bitmap");
    fs::create_dir_all(dir.path().join("comp1")).expect("mkdir comp1");

    let set_act = PeerAction::Set { component_id: "comp1".into(), range: "^1.0.0".into() };
    let prepared = prepare(dir.path(), &set_act, Chalk::new(false)).expect("prepare set-peer");
    assert!(prepared.mutation.bitmap_changed);
    assert_eq!(
        prepared.mutation.bitmap_val["comp1"]["config"][DEP_RESOLVER_ID],
        json!({ "peer": true, "defaultPeerRange": "^1.0.0" }),
    );
    let report = prepared
        .commit(Chalk::new(false))
        .expect("commit set-peer");
    assert!(report.data.contains("successfully marked the component as a peer component"));

    let unset_act = PeerAction::Unset { component_id: "comp1".into() };
    let unset_prep =
        prepare(dir.path(), &unset_act, Chalk::new(false)).expect("prepare unset-peer");
    assert!(unset_prep.mutation.bitmap_changed);
    let after: Value = unset_prep.mutation.bitmap_val;
    assert_eq!(after["comp1"]["config"][DEP_RESOLVER_ID], json!({}));
}

#[test]
fn sets_peer_in_component_json_when_present() {
    let dir = tempdir().expect("tempdir");
    fs::write(
        dir.path().join("workspace.jsonc"),
        r#"{ "teambit.workspace/workspace": { "defaultScope": "my-scope" } }"#,
    )
    .expect("write workspace.jsonc");
    fs::write(
        dir.path().join(".bitmap"),
        r#"{ "comp1": { "scope": "", "version": "", "mainFile": "index.ts", "rootDir": "comp1" }, "$schema-version": "17.0.0" }"#,
    )
    .expect("write .bitmap");
    fs::create_dir_all(dir.path().join("comp1")).expect("mkdir comp1");
    fs::write(
        dir.path().join("comp1/component.json"),
        r#"{
  "componentId": { "scope": "my-scope", "name": "comp1" },
  "propagate": false,
  "extensions": {
    "teambit.dependencies/dependency-resolver": {
      "policy": { "dependencies": { "lodash": "4.17.21" } }
    }
  }
}
"#,
    )
    .expect("write component.json");

    let set_act = PeerAction::Set { component_id: "comp1".into(), range: "^2.0.0".into() };
    let prepared = prepare(dir.path(), &set_act, Chalk::new(false)).expect("prepare set-peer");
    assert!(!prepared.mutation.bitmap_changed);
    assert_eq!(prepared.mutation.comp_json_edits.len(), 1);
    prepared
        .commit(Chalk::new(false))
        .expect("commit set-peer");
    let updated: Value =
        serde_json::from_slice(&fs::read(dir.path().join("comp1/component.json")).unwrap())
            .unwrap();
    assert_eq!(
        updated["extensions"][DEP_RESOLVER_ID],
        json!({
            "policy": { "dependencies": { "lodash": "4.17.21" } },
            "peer": true,
            "defaultPeerRange": "^2.0.0"
        }),
    );
}

#[test]
fn rejects_empty_set_or_unset_peer_arguments() {
    assert_eq!(parse_set_args(&[]), None);
    assert_eq!(parse_unset_args(&[]), None);
}
