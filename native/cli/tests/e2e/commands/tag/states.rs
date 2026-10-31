//! Unrelated bitmap states do not prevent versioning other components.
use super::soft::{bitmap, compare_command};
use crate::helper::Helper;

#[test]
fn local_only_components_stay_out_of_snap_soft_tag_and_persist() {
    let helper = Helper::new();
    helper.re_init_workspace_with(false);
    helper.populate_components(2, false, "");
    helper.output_file("comp1/index.js", "module.exports = () => 'independent';");
    helper.run("local-only set comp2");
    let node_workspace = helper.clone_workspace();
    compare_snap(&helper, &node_workspace);
    let node_workspace = helper.clone_workspace();
    assert_eq!(bitmap(&helper.scopes.local_path)["comp2"]["version"], "");
    helper.append_file("comp1/index.js", "\n// second");
    std::fs::write(
        node_workspace.join("comp1/index.js"),
        std::fs::read(helper.scopes.local_path.join("comp1/index.js")).unwrap(),
    )
    .unwrap();
    compare_command(&helper, &node_workspace, "tag --soft --message second");
    assert!(bitmap(&helper.scopes.local_path)["comp2"].get("nextVersion").is_none());
    compare_command(&helper, &node_workspace, "tag --persist=skip-build");
}

fn compare_snap(helper: &Helper, node_workspace: &std::path::Path) {
    let native = helper.native_run("snap --message first");
    let node = Helper::cmd_in_with(
        node_workspace,
        "snap --message first",
        &[("BIT_NATIVE", std::ffi::OsStr::new("off"))],
    );
    assert_eq!(native.status.code(), node.status.code());
    assert_eq!(native.stderr, node.stderr);
    let native_bitmap = bitmap(&helper.scopes.local_path);
    let node_bitmap = bitmap(node_workspace);
    let native_hash = native_bitmap["comp1"]["version"].as_str().unwrap();
    let node_hash = node_bitmap["comp1"]["version"].as_str().unwrap();
    assert_eq!(
        native.stdout.replace(native_hash, "SNAP_HASH"),
        node.stdout.replace(node_hash, "SNAP_HASH"),
    );
    assert_eq!(
        native_bitmap.to_string().replace(native_hash, "SNAP_HASH"),
        node_bitmap.to_string().replace(node_hash, "SNAP_HASH"),
    );
}

#[test]
fn removed_components_do_not_block_unrelated_soft_tags() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(2, true, "");
    helper.output_file("comp1/index.js", "module.exports = () => 'independent';");
    helper.tag_without_build("", "");
    crate::helper::remote::publish(&helper);
    helper.run("delete comp2 --silent");
    helper.append_file("comp1/index.js", "\n// next");
    let node_workspace = helper.clone_workspace();
    compare_command(&helper, &node_workspace, "tag comp1 --soft --message next");
    compare_command(&helper, &node_workspace, "tag --persist=skip-build");
}
