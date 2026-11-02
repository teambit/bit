//! Port of `e2e/harmony/lanes/rename-lane.e2e.ts` for `bit lane rename` parity ([`rename_local_lane_switch_to_main_and_switch_back`]).
//!
//! Verifies that renaming a local lane preserves unexported status across switches.

use crate::helper::{Helper, config};

/// Target lane name used when testing `bit lane rename` on an unexported local lane.
const RENAMED_LANE: &str = "new-dev";

/// Verifies that renaming a local lane and switching to `main` and back preserves `_bit_lane.exported == false` ([`RENAMED_LANE`]).
#[test]
fn rename_local_lane_switch_to_main_and_switch_back() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.native("lane create dev");
    helper.native(&format!("lane rename {RENAMED_LANE}"));
    helper.output_file("comp1/index.js", "module.exports = () => 'comp1';");
    helper.run("add comp1");
    helper.run("snap --message s1");
    helper.native("switch main");
    helper.native(&format!("switch {RENAMED_LANE}"));
    helper.run("import");

    let bitmap = config::read_jsonc(&helper.scopes.local_path.join(".bitmap"));
    assert_eq!(bitmap["_bit_lane"]["exported"].as_bool(), Some(false));
}
