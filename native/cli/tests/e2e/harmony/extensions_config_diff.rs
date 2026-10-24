//! `e2e/harmony/extensions-config-diff.e2e.ts`.

use crate::helper::{Helper, parse, strip_ansi};
use serde_json::json;

fn re_eject_and_check_status_before(helper: &Helper, full_id: &str) {
    helper.run("eject-conf bar/foo --override");
    let status = parse(&helper.native("status --json"));
    let modified = status["modifiedComponents"].as_array().unwrap();
    assert!(
        !modified
            .iter()
            .any(|item| item.as_str() == Some(full_id)),
        "expected {full_id} not modified: {status}",
    );
}

/// - `extensions config diff › component status and diff › add new extension › should make the component modified`
/// - `extensions config diff › component status and diff › add new extension › should show it in bit diff`
/// - `extensions config diff › component status and diff › add new extension › bit diff should not show internal config fields`
/// - `extensions config diff › component status and diff › remove extension › should make the component modified`
/// - `extensions config diff › component status and diff › remove extension › should show it in bit diff`
/// - `extensions config diff › component status and diff › change extension config › should make the component modified`
/// - `extensions config diff › component status and diff › change extension config › should show it in bit diff`
#[test]
fn extensions_config_diff_add_remove_and_change() {
    let helper = Helper::new();
    helper.re_init_workspace_with(false);
    helper.disable_preview();
    helper.populate_extensions(4);
    helper.create_component_bar_foo("");
    helper.add_component_bar_foo();
    helper.add_extension_to_variant("bar", "my-scope/ext1", json!({ "key": "val-variant" }));
    helper.add_extension_to_variant("bar", "my-scope/ext2", json!({ "key": "val-variant" }));
    helper.add_extension_to_variant("bar", "my-scope/ext3", json!({ "key": "val-variant" }));
    helper.add_extension_to_variant("extensions", "teambit.harmony/aspect", json!({}));
    helper.run("install");
    helper.compile();
    helper.native("tag --skip-tests");
    let before_eject = helper.clone_workspace();

    // 1. Add new extension
    re_eject_and_check_status_before(&helper, "my-scope/bar/foo@0.0.1");
    helper.set_component_json_extension(
        "bar",
        "my-scope/ext4",
        json!({ "key": "val-component-json" }),
    );
    let status1 = parse(&helper.native("status --json"));
    assert!(
        status1["modifiedComponents"]
            .as_array()
            .unwrap()
            .iter()
            .any(|val| val
                .as_str()
                .is_some_and(|text| text.starts_with("my-scope/bar/foo"))),
        "{status1}",
    );
    let diff1 = strip_ansi(&helper.native("diff"));
    assert!(diff1.contains("--- Extensions (0.0.1 original)"), "{diff1}");
    assert!(diff1.contains("+++ Extensions (0.0.1 modified)"), "{diff1}");
    assert!(
        diff1.contains("- [ my-scope/ext1@0.0.1, my-scope/ext2@0.0.1, my-scope/ext3@0.0.1 ]"),
        "{diff1}",
    );
    assert!(
        diff1.contains(
            "+ [ my-scope/ext1@0.0.1, my-scope/ext2@0.0.1, my-scope/ext3@0.0.1, my-scope/ext4@0.0.1 ]"
        ),
        "{diff1}",
    );
    assert!(diff1.contains("--- my-scope/ext4@0.0.1 configuration (0.0.1 original)"), "{diff1}");
    assert!(diff1.contains("+++ my-scope/ext4@0.0.1 configuration (0.0.1 modified)"), "{diff1}");
    assert!(diff1.contains(r#"+  "key": "val-component-json""#), "{diff1}");
    assert!(!diff1.contains("__specific"), "{diff1}");

    // 2. Remove extension
    helper.get_cloned_workspace(&before_eject);
    re_eject_and_check_status_before(&helper, "my-scope/bar/foo@0.0.1");
    helper.remove_component_json_extension("bar", "my-scope/ext3@0.0.1");
    let status2 = parse(&helper.native("status --json"));
    assert!(
        status2["modifiedComponents"]
            .as_array()
            .unwrap()
            .iter()
            .any(|val| val
                .as_str()
                .is_some_and(|text| text.starts_with("my-scope/bar/foo"))),
        "{status2}",
    );
    let diff2 = strip_ansi(&helper.native("diff"));
    assert!(diff2.contains("--- Extensions (0.0.1 original)"), "{diff2}");
    assert!(diff2.contains("+++ Extensions (0.0.1 modified)"), "{diff2}");
    assert!(
        diff2.contains("- [ my-scope/ext1@0.0.1, my-scope/ext2@0.0.1, my-scope/ext3@0.0.1 ]"),
        "{diff2}",
    );
    assert!(diff2.contains("+ [ my-scope/ext1@0.0.1, my-scope/ext2@0.0.1 ]"), "{diff2}");
    assert!(diff2.contains("--- my-scope/ext3@0.0.1 configuration (0.0.1 original)"), "{diff2}");
    assert!(diff2.contains("+++ my-scope/ext3@0.0.1 configuration (0.0.1 modified)"), "{diff2}");
    assert!(diff2.contains(r#"-  "key": "val-variant""#), "{diff2}");

    // 3. Change extension config
    re_eject_and_check_status_before(&helper, "my-scope/bar/foo@0.0.1");
    helper.set_component_json_extension(
        "bar",
        "my-scope/ext2@0.0.1",
        json!({ "newKey": "newVal" }),
    );
    let status3 = parse(&helper.native("status --json"));
    assert!(
        status3["modifiedComponents"]
            .as_array()
            .unwrap()
            .iter()
            .any(|val| val
                .as_str()
                .is_some_and(|text| text.starts_with("my-scope/bar/foo"))),
        "{status3}",
    );
    let diff3 = strip_ansi(&helper.native("diff"));
    assert!(diff3.contains("--- my-scope/ext2@0.0.1 configuration (0.0.1 original)"), "{diff3}");
    assert!(diff3.contains("+++ my-scope/ext2@0.0.1 configuration (0.0.1 modified)"), "{diff3}");
    assert!(diff3.contains(r#"-  "key": "val-variant""#), "{diff3}");
    assert!(diff3.contains(r#"+  "newKey": "newVal""#), "{diff3}");
}
