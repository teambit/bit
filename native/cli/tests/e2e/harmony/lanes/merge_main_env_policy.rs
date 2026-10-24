//! `e2e/harmony/lanes/merge-main-env-policy.e2e.ts`.

use crate::helper::{Helper, parse};

/// - `lane merge main when the comp env with deps policy is a package and not in the workspace › bit status should not show the component as modified before the merge`
/// - `lane merge main when the comp env with deps policy is a package and not in the workspace › bit lane merge main › should not fail with a "config changes" false positive`
/// - `lane merge main when the comp env with deps policy is a package and not in the workspace › bit lane merge main › should snap the diverged component`
#[test]
fn lane_merge_main_with_custom_env_policy() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.output_file("comp1/index.js", r#"module.exports = () => "v1";"#);
    helper.add_component("comp1", "");
    helper.set_empty_env();
    helper.native("env set comp1 empty-env");
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
