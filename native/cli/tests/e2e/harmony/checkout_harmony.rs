//! Ported from `e2e/harmony/checkout-harmony.e2e.ts`.

#[path = "checkout_harmony/extra.rs"]
mod extra;

use crate::helper::Helper;
use std::path::Path;

const BAR_FOO_V1: &str = "module.exports = function foo() { return 'got foo'; };";
const BAR_FOO_V2: &str = "module.exports = function foo() { return 'got foo v2'; };";
const BAR_FOO_V3: &str = "module.exports = function foo() { return 'got foo v3'; };";
const SUCCESS_OUTPUT: &str = "successfully switched";

#[test]
fn non_existing_and_after_component_created() {
    let helper = Helper::new();
    helper.re_init_workspace();
    let err = helper.run_with_try_catch("bit checkout 1.0.0 utils/non-exist");
    assert!(err.contains("utils/non-exist"));

    helper.create_component_bar_foo(BAR_FOO_V1);
    helper.add_component_bar_foo();

    let before_tag = helper.run_with_try_catch("bit checkout 1.0.0 bar/foo");
    assert!(before_tag.contains("is new, no version to checkout"));

    helper.tag_all_without_build("--ver 0.0.5");

    let non_exist_ver = helper.run_with_try_catch("bit checkout 1.0.0 bar/foo");
    assert!(non_exist_ver.contains("bar/foo doesn't have version 1.0.0"));

    helper.create_component_bar_foo(BAR_FOO_V2);
    let already_ver = helper.run_with_try_catch("bit checkout 0.0.5 bar/foo");
    assert!(already_ver.contains("bar/foo is already at version 0.0.5"));

    helper.tag_all_without_build("--ver 0.0.10");
    let output = helper.run_with_try_catch("bit checkout 0.0.5 bar/foo");
    assert!(output.contains(SUCCESS_OUTPUT));
    assert!(output.contains("0.0.5"));
    assert!(output.contains("bar/foo"));
    assert_eq!(helper.read_file("bar/foo.js"), BAR_FOO_V1);

    let bitmap = helper.read_bit_map();
    assert_eq!(bitmap["bar/foo"]["version"].as_str(), Some("0.0.5"));

    let status_output = helper.run_cmd("bit status");
    assert!(!status_output.contains("modified components"));

    let list_output = helper.list_local_scope_parsed("--outdated");
    let arr = list_output.as_array().expect("list array");
    assert_eq!(arr[0]["currentVersion"].as_str(), Some("0.0.5"));
    assert_eq!(arr[0]["localVersion"].as_str(), Some("0.0.10"));

    helper.create_component_bar_foo(r#"console.log("modified components");"#);
    let newer_err = helper.run_with_try_catch("bit tag bar/foo --skip-tests");
    assert!(newer_err.contains("0.0.10"));
    assert!(newer_err.contains("0.0.5"));

    let tag_output = helper.tag_without_build("bar/foo", "--ignore-newest-version --skip-tests");
    assert!(tag_output.contains("1 component(s) tagged"));
}

#[test]
fn components_with_dependencies_with_multiple_versions() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(3, true, "");
    helper.tag_all_without_build("");
    helper.populate_components(3, true, "v2");
    helper.tag_all_without_build("");
    let local_scope = helper.clone_workspace();

    let result = helper.run_cmd("node app.js");
    assert_eq!(result.trim(), "comp1v2 and comp2v2 and comp3v2");

    let output = helper.checkout_version("0.0.1", "comp1", "");
    let bitmap = helper.read_bit_map();
    assert!(output.contains(SUCCESS_OUTPUT));
    assert!(output.contains("0.0.1"));
    assert!(output.contains("comp1"));

    let result_after = helper.run_cmd("node app.js");
    assert_eq!(result_after.trim(), "comp1 and comp2v2 and comp3v2");
    assert_eq!(bitmap["comp1"]["version"].as_str(), Some("0.0.1"));
    assert_eq!(bitmap["comp2"]["version"].as_str(), Some("0.0.2"));
    assert_eq!(bitmap["comp3"]["version"].as_str(), Some("0.0.2"));

    let status_output = helper.run_cmd("bit status");
    assert!(status_output.contains("modified components"));
    assert!(
        !helper
            .local_path()
            .join("package.json")
            .exists(),
    );
    assert!(
        !helper
            .local_path()
            .join("package-lock.json")
            .exists(),
    );

    helper.get_cloned_workspace(&local_scope);
    helper.export("");
    helper.checkout("0.0.1 --all");
    let head = helper.get_head("comp1");
    let object_path = helper.get_hash_path_of_object(&head);
    helper.delete_object(&object_path);
    helper.checkout_head("--all");
}

#[test]
fn file_changes_and_deletions_and_additions_on_checkout() {
    let helper = Helper::new();
    helper.re_init_workspace();
    helper.output_file("bar/index.js", "console.log('v1');");
    helper.output_file("bar/foo.txt", "v1");
    helper.add_component("bar", "");
    helper.tag_all_without_build("");
    helper.output_file("bar/foo.txt", "v2");
    helper.tag_all_without_build("");
    helper.output_file("bar/index.js", "console.log('v2');");
    helper.checkout_version("0.0.1", "bar", "");
    assert_eq!(helper.read_file("bar/foo.txt"), "v1");

    helper.set_workspace_with_remote_scope();
    helper.populate_components(1, true, "");
    helper.output_file("comp1/foo.ts", "");
    helper.tag_all_without_build("");
    helper.export("");
    let scope_after_first = helper.clone_workspace();
    helper.tag_include_unmodified_without_build("", "");
    helper.export("");
    helper.get_cloned_workspace(&scope_after_first);
    helper.import();
    helper.delete_path("comp1/foo.ts");
    let scope_before_checkout = helper.clone_workspace();

    helper.checkout_head("comp1 --skip-dependency-installation");
    assert!(
        !helper
            .local_path()
            .join("comp1/foo.ts")
            .exists(),
    );

    helper.get_cloned_workspace(&scope_before_checkout);
    helper.checkout_reset("comp1 --skip-dependency-installation");
    assert!(
        helper
            .local_path()
            .join("comp1/foo.ts")
            .exists(),
    );

    helper.set_workspace_with_remote_scope();
    helper.populate_components(1, true, "");
    helper.tag_all_without_build("");
    helper.export("");
    let after_first_export = helper.clone_workspace();
    helper.output_file("comp1/foo.ts", "");
    helper.compile();
    helper.tag_all_without_build("");
    helper.export("");
    helper.get_cloned_workspace(&after_first_export);
    helper.import();
    helper.checkout_head("--all");
    assert!(
        helper
            .local_path()
            .join("comp1/foo.ts")
            .is_file(),
    );
}

#[test]
fn modified_component_with_conflicts() {
    let helper = Helper::new();
    helper.re_init_workspace();
    helper.create_component_bar_foo(&format!("{BAR_FOO_V1}\n"));
    helper.add_component_bar_foo();
    helper.tag_component_bar_foo();
    helper.create_component_bar_foo(&format!("{BAR_FOO_V2}\n"));
    helper.tag_component_bar_foo();
    helper.create_component_bar_foo(&format!("{BAR_FOO_V3}\n"));
    let local_scope = helper.clone_workspace();

    let manual_out = helper.checkout_version("0.0.1", "bar/foo", "--manual");
    assert!(manual_out.contains(SUCCESS_OUTPUT));
    assert!(manual_out.contains("0.0.1"));
    assert!(manual_out.contains("bar/foo"));
    assert!(manual_out.contains("automatic merge failed"));
    let manual_content = helper.read_file("bar/foo.js");
    assert!(manual_content.contains("<<<<<<< 0.0.2 modified"));
    assert!(manual_content.contains("======="));
    assert!(manual_content.contains(">>>>>>> 0.0.1"));
    assert!(manual_content.ends_with('\n'));
    assert_eq!(helper.read_bit_map()["bar/foo"]["version"].as_str(), Some("0.0.1"));
    assert!(helper.run_cmd("bit status").contains("modified components"));
    assert!(!manual_out.contains("compilation failed"));
    assert!(!manual_out.contains("Merge conflict marker encountered"));
    assert!(!manual_out.contains("installing dependencies"));
    assert!(!manual_out.contains("pnpm"));
    assert!(!manual_out.contains("yarn"));

    helper.get_cloned_workspace(&local_scope);
    let theirs_out = helper.checkout_version("0.0.1", "bar/foo", "--auto-merge-resolve theirs");
    assert!(theirs_out.contains(SUCCESS_OUTPUT));
    assert!(theirs_out.contains("0.0.1"));
    assert!(theirs_out.contains("bar/foo"));
    assert!(theirs_out.contains("updated"));
    assert_eq!(helper.read_file("bar/foo.js"), format!("{BAR_FOO_V1}\n"));
    assert_eq!(helper.read_bit_map()["bar/foo"]["version"].as_str(), Some("0.0.1"));
    assert!(!helper.run_cmd("bit status").contains("modified components"));

    helper.get_cloned_workspace(&local_scope);
    let ours_out = helper.checkout_version("0.0.1", "bar/foo", "--auto-merge-resolve ours");
    assert!(ours_out.contains(SUCCESS_OUTPUT));
    assert!(ours_out.contains("0.0.1"));
    assert!(ours_out.contains("bar/foo"));
    assert!(!ours_out.contains("added, removed, updated or merged"));
    assert_eq!(helper.read_file("bar/foo.js"), format!("{BAR_FOO_V3}\n"));
    assert_eq!(helper.read_bit_map()["bar/foo"]["version"].as_str(), Some("0.0.1"));
    assert!(helper.run_cmd("bit status").contains("modified components"));

    assert_conflicts_with_added_files(&helper, &local_scope);
}

fn assert_conflicts_with_added_files(helper: &Helper, local_scope: &Path) {
    helper.get_cloned_workspace(local_scope);
    helper.output_file("bar/foo2.js", "");
    let scope_with_added = helper.clone_workspace();

    let manual_out = helper.checkout_version("0.0.1", "bar/foo", "--manual");
    assert!(manual_out.contains("added"));
    assert!(manual_out.contains("foo2.js"));
    assert!(
        helper
            .local_path()
            .join("bar/foo2.js")
            .is_file(),
    );

    helper.get_cloned_workspace(&scope_with_added);
    let theirs_out = helper.checkout_version("0.0.1", "bar/foo", "--auto-merge-resolve theirs");
    assert!(theirs_out.contains("removed"));
    assert!(theirs_out.contains("foo2.js"));
    assert!(
        !helper
            .local_path()
            .join("bar/foo2.js")
            .exists(),
    );

    helper.get_cloned_workspace(&scope_with_added);
    let ours_out = helper.checkout_version("0.0.1", "bar/foo", "--auto-merge-resolve ours");
    assert!(!ours_out.contains("added, removed, updated or merged"));
    assert!(
        helper
            .local_path()
            .join("bar/foo2.js")
            .is_file(),
    );
}
