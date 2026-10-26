//! Snapshot range validation matches the released guard and its feature opt-in.
use super::{version, workspace};
use crate::helper::{Helper, config};
use std::ffi::OsStr;

#[test]
fn plus_ranges_require_the_feature_before_snapshot_publication() {
    let helper = workspace();
    helper.output_file(
        "bar/env.jsonc",
        r#"{"policy":{"peers":[{"name":"sample-peer","version":"1.0.0","supportedRange":"+^"}]}}"#,
    );
    let baseline = helper.clone_workspace();
    for feature in ["", "plus-range-versions"] {
        helper.get_cloned_workspace(&baseline);
        let oracle = helper.clone_workspace();
        let command = "snap bar/foo -m range --ignore-issues '*'";
        let node = Helper::cmd_in_with(
            &oracle,
            command,
            &[("BIT_NATIVE", OsStr::new("off")), ("BIT_FEATURES", OsStr::new(feature))],
        );
        let native = Helper::cmd_in_with(
            &helper.scopes.local_path,
            command,
            &[("BIT_FEATURES", OsStr::new(feature))],
        );
        assert!(native.native, "{}", native.trace);
        assert_eq!(native.status.code(), node.status.code());
        let actual = normalize_hash(&helper.scopes.local_path, &native.stdout);
        let expected = normalize_hash(&oracle, &node.stdout);
        assert_eq!(actual, expected);
        assert_eq!(native.stderr, node.stderr);
        assert_eq!(native.status.success(), !feature.is_empty());
        if !feature.is_empty() {
            assert_eq!(version(&helper.scopes.local_path), version(&oracle));
        }
    }
}

fn normalize_hash(root: &std::path::Path, output: &str) -> String {
    let bitmap = config::read_jsonc(&root.join(".bitmap"));
    let version = bitmap["bar/foo"]["version"].as_str().unwrap_or_default();
    if version.len() == 40 { output.replace(version, "SNAP_HASH") } else { output.to_owned() }
}
