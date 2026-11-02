//! Port of `e2e/harmony/lanes/merge-main-env-policy.e2e.ts` for custom env policy during `lane merge main` ([`lane_merge_main_with_custom_env_policy`]).
//!
//! Verifies that external env dependency policies do not trigger false config conflicts.

use crate::helper::{Helper, parse};

/// Custom environment ID applied to `comp1` before testing `bit lane merge main`.
const EMPTY_ENV: &str = "empty-env";

/// Verifies that `bit lane merge main` succeeds without false config conflicts when a component uses an external env policy.
#[test]
fn lane_merge_main_with_custom_env_policy() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.output_file("comp1/index.js", r#"module.exports = () => "v1";"#);
    helper.add_component("comp1", "");
    helper.set_empty_env();
    helper.native(&format!("env set comp1 {EMPTY_ENV}"));
    helper.link("");
    helper.compile();
    helper.run("tag --skip-tests");
    helper.run("export");

    helper.native("lane create dev");
    helper.output_file("comp1/index.js", r#"module.exports = () => "v1-lane";"#);
    helper.run("snap --skip-tests");
    helper.run("export");

    helper.run("switch main -x");
    helper.output_file("comp1/main-change.js", "module.exports = true;");
    helper.run("tag --skip-tests");
    helper.run("export");

    helper.run("switch dev -x");
    let status = parse(&helper.native("status --json"));
    assert_eq!(
        status["modifiedComponents"]
            .as_array()
            .unwrap()
            .len(),
        0,
    );

    let merge_out = helper.run("lane merge main -x");
    assert!(!merge_out.contains("config changes"), "{merge_out}");
    assert!(merge_out.contains("successfully merged"), "{merge_out}");
    assert!(merge_out.contains("merge-snapped components"), "{merge_out}");
}
