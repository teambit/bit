//! `e2e/harmony/lanes/lane-history-merge.e2e.ts`.

use crate::helper::{Helper, parse};

/// lane history with merge operations › merging a lane when the target lane is behind (fast-forward merge, no snap)
#[test]
fn lane_history_records_fast_forward_merge_entry() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(2, true, "");

    helper.native("lane create lane-a");
    helper.native(r#"snap -m "initial snap on lane-a""#);
    helper.native("export");

    let before_json = parse(&helper.native("lane history --json"));
    let before = before_json.as_array().unwrap();

    helper.native("lane create lane-b");
    helper.populate_components(2, true, "v2");
    helper.native(r#"snap -m "changes on lane-b""#);
    helper.native("export");

    helper.native("switch lane-a -x");
    helper.native("lane merge lane-b -x");

    let after_json = parse(&helper.native("lane history --json"));
    let after = after_json.as_array().unwrap();
    assert!(after.len() > before.len());

    let merge_entry = after
        .iter()
        .find(|entry| {
            entry["log"]["message"]
                .as_str()
                .or_else(|| entry["message"].as_str())
                .is_some_and(|msg| msg.contains("merge"))
        })
        .expect("expected a merge entry in lane history");
    let msg = merge_entry["log"]["message"]
        .as_str()
        .or_else(|| merge_entry["message"].as_str())
        .unwrap();
    assert!(
        msg.contains(&format!("{}/lane-b", helper.scopes.remote)),
        "expected {}/lane-b in {msg}",
        helper.scopes.remote,
    );
}
