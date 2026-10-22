//! `e2e/harmony/lanes/lane-history-diff.e2e.ts`.

use crate::helper::{Helper, parse};

#[test]
fn bit_reset_removes_the_lane_history_entry_of_the_reset_snap() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(2, true, "");
    helper.native("lane create dev");
    helper.native(r#"snap --skip-tests -m "snap A""#);
    helper.native("export");

    helper.populate_components(2, true, "v2");
    helper.native(r#"snap --skip-tests -m "snap B""#);

    helper.native("reset --silent");

    helper.populate_components(2, true, "v3");
    helper.native(r#"snap --skip-tests -m "snap C""#);
    helper.native("export");

    helper.re_init_workspace();
    helper.add_remote_scope();
    helper.native(&format!("switch {}/dev --get-all", helper.scopes.remote));

    let history_entries = parse(&helper.native("lane history --json"));
    let entries = history_entries.as_array().unwrap();

    // 1. should not have a lane-history entry for the reset snap
    let messages: Vec<&str> = entries
        .iter()
        .filter_map(|entry| entry["message"].as_str())
        .collect();
    assert!(
        messages
            .iter()
            .any(|m| m.contains("snap A")),
    );
    assert!(
        messages
            .iter()
            .any(|m| m.contains("snap C")),
    );
    assert!(
        !messages
            .iter()
            .any(|m| m.contains("snap B")),
    );

    // 2. no args: should diff latest against its predecessor without errors
    let output = helper.run_cmd("lane history-diff");
    assert!(output.contains("comp1"));
    assert!(output.contains("comp2"));
    assert!(!output.contains("Diff failed"));

    // 3. with one arg (latest id): should diff against predecessor without errors
    let latest_id = entries.last().unwrap()["id"].as_str().unwrap();
    let output = helper.run_cmd(&format!("lane history-diff {latest_id}"));
    assert!(output.contains("comp1"));
    assert!(output.contains("comp2"));
    assert!(!output.contains("Diff failed"));

    // 4. with one arg (first id): should throw since it has no predecessor
    let first_id = entries.first().unwrap()["id"].as_str().unwrap();
    let err = helper.try_cmd(&format!("lane history-diff {first_id}"));
    assert!(!err.status.success());
    let combined = format!("{}{}", err.stdout, err.stderr);
    assert!(combined.contains("is the first entry and has no predecessor"));
}
