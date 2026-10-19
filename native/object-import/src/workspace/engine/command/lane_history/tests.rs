use super::selection;
use serde_json::json;
#[test]
fn restore_partition_counts_inactive_bitmap_members_and_preserves_history_order() {
    let bitmap = json!({"$schema-version":"17.0.0","a":{"name":"a","scope":"s","version":"old","isAvailableOnCurrentLane":false},"c":{"name":"c","scope":"","defaultScope":"s","version":"old"}});
    let item = json!({"components":["s/c@cccccccccccccccccccccccccccccccccccccccc","s/b@bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","s/a@aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"]});
    let phases =
        selection::phases(&item, &bitmap, &json!({"defaultScope":"s"}), true, true).unwrap();
    assert_eq!(phases.len(), 2);
    assert_eq!(
        phases[0].versions
            .iter()
            .map(|(id, _)| id.as_str())
            .collect::<Vec<_>>(),
        vec!["s/c", "s/a"],
    );
    assert!(phases[0].revert);
    assert_eq!(phases[1].versions[0].0, "s/b");
    assert!(!phases[1].revert);
}
#[test]
fn checkout_retains_exact_cross_scope_versions_and_rejects_duplicate_membership() {
    let item =
        json!({"components":["other/a@0.0.1","s/a@aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"]});
    let phases = selection::phases(&item, &json!({}), &json!({}), false, true).unwrap();
    assert_eq!(phases.len(), 1);
    assert_eq!(phases[0].versions[0], ("other/a".into(), "0.0.1".into()));
    let duplicate = json!({"components":["s/a@0.0.1","s/a@0.0.2"]});
    assert!(selection::phases(&duplicate, &json!({}), &json!({}), false, false).is_err());
}

#[test]
fn selected_history_proof_is_propagated_and_rejects_later_content_changes() {
    let directory = tempfile::tempdir().unwrap();
    let root = directory.path();
    let history = root.join("history-object");
    std::fs::write(&history, b"selected history").unwrap();
    let mut proofs = Vec::new();
    super::proof::read(&history, &mut proofs).unwrap();
    let state = super::State {
        lane_history: Some(Box::new(super::Retained {
            root: root.into(),
            token: "retained".into(),
            lane_id: crate::command_import::lane::Id { scope: "s".into(), name: "dev".into() },
            lane_hash: "a".repeat(40),
            phases: vec![],
            next: 0,
            proofs,
        })),
        ..super::State::default()
    };
    let request=serde_json::from_value(json!({"root":root,"home":root,"globalRemotesFile":root.join("global-remotes.json"),"operation":"checkout","options":{"laneHistory":{"token":"retained","phase":0},"skipDependencyInstallation":true}})).unwrap();
    let mut phase_proofs = Vec::new();
    super::extend_proofs(&request, &state, &mut phase_proofs).unwrap();
    std::fs::write(&history, b"different history").unwrap();
    assert!(super::proof::verify(&phase_proofs).is_err());
}

#[test]
fn bitmap_acknowledgment_requires_retained_preimage_and_actual_written_bytes() {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join(".bitmap");
    std::fs::write(&path, b"before").unwrap();
    let mut proofs = Vec::new();
    super::proof::read(&path, &mut proofs).unwrap();
    let receipt = crate::command_import::write_receipt(&path, Some(b"before"), b"after");
    std::fs::write(&path, b"tampered").unwrap();
    assert!(selection::accept_bitmap(&mut proofs, &receipt).is_err());
    std::fs::write(&path, b"after").unwrap();
    selection::accept_bitmap(&mut proofs, &receipt).unwrap();
    super::proof::verify(&proofs).unwrap();
    assert!(selection::accept_bitmap(&mut proofs, &receipt).is_err());
}
