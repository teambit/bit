use crate::{
    commands::move_paths::support::{self, tree},
    helper::{Helper, Run},
};
use std::{ffi::OsStr, path::Path};

pub(super) fn fixture() -> Helper {
    let helper = support::workspace(1, true);
    support::setup(&helper, "export");
    helper.output_file("comp1/index.js", "module.exports=()=> 'second';\n");
    support::tag(&helper);
    support::setup(&helper, "export");
    helper
}
pub(super) fn compare(helper: &Helper, command: &str, color: bool) -> Run {
    compare_with_cleanup(helper, command, color, |_| {}, |_| {})
}
fn compare_with_cleanup(
    helper: &Helper,
    command: &str,
    color: bool,
    prepare: impl Fn(&Path),
    cleanup: impl Fn(&Path),
) -> Run {
    compare_with_snapshot(helper, command, color, prepare, cleanup, tree)
}
pub(super) fn compare_with_snapshot(
    helper: &Helper,
    command: &str,
    color: bool,
    prepare: impl Fn(&Path),
    cleanup: impl Fn(&Path),
    observe: impl Fn(&Path) -> std::collections::BTreeMap<String, Vec<u8>>,
) -> Run {
    let scope = &helper.scopes.remote_path;
    let baseline = helper.clone_remote_scope();
    let environment = [("FORCE_COLOR", OsStr::new(if color { "1" } else { "0" }))];
    let mut oracle = environment.to_vec();
    oracle.push(("BIT_NATIVE", OsStr::new("off")));
    prepare(scope);
    let node = Helper::cmd_in_with(scope, command, &oracle);
    let expected = observe(scope);
    cleanup(scope);
    helper.restore_remote_scope(&baseline);
    prepare(scope);
    let unavailable = helper.scopes.e2e_dir.join("unavailable-runtime");
    let mut native = environment.to_vec();
    native.extend([
        ("BIT_NODE_BINARY", unavailable.as_os_str()),
        ("BIT_NODE_CLI", unavailable.as_os_str()),
    ]);
    let actual = Helper::cmd_in_with(scope, command, &native);
    let actual_tree = observe(scope);
    cleanup(scope);
    assert!(actual.native, "{actual:?}");
    assert!(!actual.trace.contains("starting the JavaScript host"), "{actual:?}");
    assert_eq!(actual.status.code(), node.status.code(), "{actual:?}\n{node:?}");
    assert_eq!(actual.stdout, node.stdout, "{actual:?}\n{node:?}");
    assert_eq!(actual.stderr, node.stderr, "{actual:?}\n{node:?}");
    let differences: std::collections::BTreeSet<_> = actual_tree
        .keys()
        .chain(expected.keys())
        .filter(|key| actual_tree.get(*key) != expected.get(*key))
        .collect();
    assert!(differences.is_empty(), "{command}: changed scope entries: {differences:?}");
    actual
}
