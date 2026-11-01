//! Port of `e2e/harmony/lanes/rename-lane.e2e.ts` for `bit lane rename` parity ([`rename_local_lane_switch_to_main_and_switch_back`]).
//! Verifies that renaming a local lane preserves unexported status across switches.

use crate::helper::{Helper, config};

/// rename lanes › rename local lane, switch to main and then switch back to the lane
#[test]
fn rename_local_lane_switch_to_main_and_switch_back() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.native("lane create dev");
    helper.native("lane rename new-dev");
    helper.output_file("comp1/index.js", "module.exports = () => 'comp1';");
    helper.run("add comp1");
    helper.run("snap --message s1");
    helper.native("switch main");
    helper.native("switch new-dev");
    helper.run("import");

    let bitmap = config::read_jsonc(&helper.scopes.local_path.join(".bitmap"));
    assert_eq!(bitmap["_bit_lane"]["exported"].as_bool(), Some(false));
}
