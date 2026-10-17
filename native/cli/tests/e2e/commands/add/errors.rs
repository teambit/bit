use super::support::{compare, workspace};
#[test]
fn invalid_id_version_and_conflicting_name_flags_leave_state_unchanged() {
    for command in ["add bar -i jaja -n test", "add bar -i bar/fo.o", "add bar -i bar/foo@0.0.4"] {
        let helper = workspace();
        helper.output_file("bar/foo.js", "module.exports=1;\n");
        assert!(!compare(&helper, command).status.success());
    }
}
#[test]
fn individual_files_and_missing_or_outside_paths_match_errors() {
    for command in ["add bar/foo.js", "add missing", "add ../outside"] {
        let helper = workspace();
        helper.output_file("bar/foo.js", "module.exports=1;\n");
        if command.contains("../outside") {
            std::fs::create_dir_all(helper.scopes.e2e_dir.join("outside")).unwrap();
            std::fs::write(helper.scopes.e2e_dir.join("outside/index.js"), "module.exports=2;\n")
                .unwrap();
        }
        assert!(!compare(&helper, command).status.success());
    }
}
#[test]
fn tracking_inside_an_existing_component_reports_parent_owner() {
    let helper = workspace();
    helper.output_file("comp1/index.js", "module.exports=1;\n");
    helper.run("add comp1");
    helper.output_file("comp1/foo/foo.ts", "export {};\n");
    assert!(!compare(&helper, "add comp1/foo").status.success());
}
