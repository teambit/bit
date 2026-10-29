//! Qualify the upstream deduplication against the older pinned and current releases.
use crate::{
    commands::move_paths::support::tree,
    helper::{Helper, Run},
};
use std::ffi::OsStr;

pub(super) fn compare_deduplicated(helper: &Helper, expected_count: usize) -> Run {
    let scope = &helper.scopes.remote_path;
    let version = Helper::cmd_in_with(scope, "version", &[("BIT_NATIVE", OsStr::new("off"))]);
    assert!(version.status.success(), "{version:?}");
    let baseline = helper.clone_remote_scope();
    let node = Helper::cmd_in_with(
        scope,
        "version-history build comp1",
        &[("BIT_NATIVE", OsStr::new("off"))],
    );
    let expected_tree = tree(scope);
    helper.restore_remote_scope(&baseline);
    let unavailable = helper.scopes.e2e_dir.join("unavailable-runtime");
    let native = Helper::cmd_in_with(
        scope,
        "version-history build comp1",
        &[("BIT_NODE_BINARY", unavailable.as_os_str()), ("BIT_NODE_CLI", unavailable.as_os_str())],
    );
    assert!(native.native && native.status.success(), "{native:?}");
    assert_eq!(node.status.code(), native.status.code());
    assert_eq!(node.stderr, native.stderr);
    assert_eq!(tree(scope), expected_tree);
    let expected = upstream_output(&node.stdout, version.stdout.trim(), expected_count);
    assert_eq!(native.stdout, expected);
    native
}

fn upstream_output(output: &str, version: &str, count: usize) -> String {
    if version == "2.2.146" {
        let old = format!(": added {} hashes\n", count + 1);
        assert_eq!(output.matches(&old).count(), 1, "{output}");
        return output.replace(&old, &format!(": added {count} hashes\n"));
    }
    assert_eq!(version, "2.2.168", "unqualified reference release");
    assert!(output.contains(&format!(": added {count} hashes\n")), "{output}");
    output.to_owned()
}
