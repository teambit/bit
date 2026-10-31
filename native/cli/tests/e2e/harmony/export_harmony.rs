//! `e2e/harmony/export-harmony.e2e.ts`.

use crate::helper::{Helper, remote};

/// export functionality on Harmony › export, re-init the remote scope, tag and export
#[test]
fn export_reinit_remote_scope_tag_and_export() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.output_file("comp1/index.js", "module.exports = () => 'comp1';");
    helper.native("add comp1");
    helper.native("tag --message v1");
    remote::publish(&helper);
    helper.re_init_remote_scope();
    helper.output_file("comp1/index.js", "module.exports = () => 'comp1-v2';");
    helper.native("tag --message v2");

    let err = helper.native_run("export");
    assert!(!err.status.success());
    let combined = format!("{}{}", err.stdout, err.stderr);
    assert!(combined.contains("0.0.1"), "{combined}");

    helper.native("export --all-versions");
}

/// export functionality on Harmony › export, tag and export
#[test]
fn export_tag_and_export() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.output_file("comp1/index.js", "module.exports = () => 'comp1';");
    helper.native("add comp1");
    helper.native("tag --message v1");
    remote::publish(&helper);
    helper.output_file("comp1/index.js", "module.exports = () => 'comp1-v2';");
    helper.native("tag --message v2");
    remote::publish(&helper);

    helper.native("cat-component comp1@0.0.1 --json");
    let vh = Helper::cmd_in(
        &helper.scopes.remote_path,
        &format!("cat-version-history {}/comp1 --json", helper.scopes.remote),
    );
    assert!(vh.status.success(), "{vh:?}");
    let vh_json: serde_json::Value = serde_json::from_str(&vh.stdout).unwrap();
    assert_eq!(
        vh_json["versions"]
            .as_array()
            .unwrap()
            .len(),
        2,
    );

    helper.output_file("comp1/index.js", "module.exports = () => 'comp1-v3';");
    helper.native("tag --message v3");
    helper.native("reset comp1");
}

/// export functionality on Harmony › when version history is out of date
#[test]
fn export_when_version_history_is_out_of_date() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.native("lane create lane-a");
    helper.output_file("comp1/index.js", "module.exports = () => 'comp1';");
    helper.native("add comp1");
    helper.native("snap --message s1");
    remote::publish(&helper);
    helper.native("lane create lane-b");
    helper.native("snap --unmodified --message s2");
    remote::publish(&helper);
    helper.native("switch lane-a -x");
    helper.native("lane merge lane-b -x --message merged");
    helper.native("snap --unmodified --message s3");
    remote::publish(&helper);
}
