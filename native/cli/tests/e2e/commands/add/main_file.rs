use super::support::{compare, workspace};
use crate::helper::config;
use std::fs;
#[test]
fn dynamic_parent_main_file_and_missing_directory_main_match_node() {
    for command in [
        r#"add bar -m "{PARENT}/{PARENT}.js" -n test"#,
        "add bar -i bar/foo -m mainDir",
        "add bar -i bar/foo -m missing.js",
    ] {
        let helper = workspace();
        helper.output_file("bar/bar.js", "module.exports=1;\n");
        helper.output_file("bar/foo1.js", "module.exports=2;\n");
        helper.output_file("mainDir/main.js", "module.exports=3;\n");
        compare(&helper, command);
    }
}
#[test]
fn removed_main_can_be_replaced_by_a_new_explicit_main() {
    let helper = workspace();
    helper.output_file("bar/foo.js", "module.exports=1;\n");
    helper.output_file("bar/foo-main.js", "module.exports=2;\n");
    helper.run("add bar -m foo-main.js -i bar/foo");
    fs::remove_file(helper.scopes.local_path.join("bar/foo-main.js")).unwrap();
    helper.output_file("bar/foo-main2.js", "module.exports=3;\n");
    compare(&helper, "add bar -m bar/foo-main2.js -i bar/foo");
    assert_eq!(
        config::read_jsonc(&helper.scopes.local_path.join(".bitmap"))["bar/foo"]["mainFile"],
        "foo-main2.js",
    );
}
#[test]
fn platform_case_sensitivity_controls_explicit_main_lookup() {
    let helper = workspace();
    helper.output_file("Bar/foo.js", "module.exports=1;\n");
    compare(&helper, "add Bar -i bar -m bar/foo.js");
}
