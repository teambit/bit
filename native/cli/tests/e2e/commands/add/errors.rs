//! End-to-end error parity tests ([`compare`]) for `bit add` with invalid IDs, individual files, outside paths, and nested component directories.
//!
//! Verifies that rejected `bit add` invocations leave [`workspace`] state unchanged.

use super::support::{compare, workspace};
/// Verifies invalid component IDs, version suffixes, and conflicting `-i`/`-n` flags fail identically via [`compare`].
///
/// Covers `-i` with `-n`, dots in component names, and `@version` suffixes on `bit add`.
#[test]
fn invalid_id_version_and_conflicting_name_flags_leave_state_unchanged() {
    for command in ["add bar -i jaja -n test", "add bar -i bar/fo.o", "add bar -i bar/foo@0.0.4"] {
        let helper = workspace();
        helper.output_file("bar/foo.js", "module.exports=1;\n");
        assert!(!compare(&helper, command).status.success());
    }
}
/// Verifies [`compare`] matches error output when adding individual files, missing paths, or paths outside the workspace.
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
/// Verifies [`compare`] reports the parent component owner when adding a nested subdirectory (`comp1/foo`).
///
/// Ensures subdirectories inside an already tracked component root cannot be tracked as separate components.
#[test]
fn tracking_inside_an_existing_component_reports_parent_owner() {
    let helper = workspace();
    helper.output_file("comp1/index.js", "module.exports=1;\n");
    helper.run("add comp1");
    helper.output_file("comp1/foo/foo.ts", "export {};\n");
    assert!(!compare(&helper, "add comp1/foo").status.success());
}
