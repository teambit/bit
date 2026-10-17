//! Root providers run before report-level stash errors, exactly once per invocation.
use super::support::{command, compare_stashes};
use crate::helper::{Helper, config};
use serde_json::json;
use std::{ffi::OsStr, fs};
fn fixture() -> Helper {
    let helper = super::super::snapshot_environments::callback_workspace(false);
    let paths = [
        "snapshot-hook/index.js".to_owned(),
        "snapshot-hook/dist/index.js".to_owned(),
        format!(
            "node_modules/.bit_roots/teambit.harmony_aspect/node_modules/@{}/callbacks.hook/dist/index.js",
            helper.scopes.remote,
        ),
    ];
    for path in paths {
        let path = helper.scopes.local_path.join(path);
        let source = fs::read_to_string(&path).unwrap();
        if !source.contains("stash-provider-startups") {
            fs::write(path, source.replace("console.log('fixture provider startup');", "fs.appendFileSync(workspace.path+'/stash-provider-startups','x');console.log('fixture provider startup');")).unwrap();
        }
    }
    helper
}
#[test]
fn report_errors_keep_root_provider_effects_output_and_complete_history() {
    let helper = fixture();
    let oracle = helper.clone_workspace();
    for (index, error) in [
        "stash load",
        "stash load --force-ours --force-theirs",
        "stash load --auto-merge-resolve invalid",
    ]
    .iter()
    .enumerate()
    {
        command(&helper, &oracle, error);
        let actual = fs::read(helper.scopes.local_path.join("stash-provider-startups")).unwrap();
        assert_eq!(actual, fs::read(oracle.join("stash-provider-startups")).unwrap());
        assert_eq!(actual, vec![b'x'; index + 1]);
    }
}
#[test]
fn empty_message_preserves_the_released_boolean_metadata_through_pre_effect_fallback() {
    let helper = fixture();
    let oracle = helper.clone_workspace();
    let command = r#"stash save --include-new -m """#;
    let actual = helper.cmd(command);
    let expected = Helper::cmd_in_with(&oracle, command, &[("BIT_NATIVE", OsStr::new("off"))]);
    assert!(!actual.native, "{}", actual.trace);
    assert_eq!(actual.status.code(), expected.status.code());
    assert_eq!(actual.stdout, expected.stdout);
    assert_eq!(actual.stderr, expected.stderr);
    assert_eq!(
        super::support::history(&helper.scopes.local_path),
        super::support::history(&oracle),
    );
    assert_eq!(
        config::read_jsonc(&helper.scopes.local_path.join(".bitmap")),
        config::read_jsonc(&oracle.join(".bitmap")),
    );
    assert_eq!(
        fs::read(helper.scopes.local_path.join("stash-provider-startups")).unwrap(),
        fs::read(oracle.join("stash-provider-startups")).unwrap(),
    );
    compare_stashes(&helper.scopes.local_path, &oracle);
    let manifest: serde_json::Value = serde_json::from_slice(
        &fs::read(helper.scopes.local_path.join(".bit/stash/stash-1.json")).unwrap(),
    )
    .unwrap();
    assert_eq!(manifest["metadata"]["message"], json!(true));
    super::support::command(&helper, &oracle, "stash list");
}
