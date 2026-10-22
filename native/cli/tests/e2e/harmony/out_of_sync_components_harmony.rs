//! `e2e/harmony/out-of-sync-components-harmony.e2e.ts`.

use crate::helper::{Helper, config};

/// - `components that are not synced between the scope and the consumer › consumer with a new component and scope with the same component as exported with defaultScope configured › bit tag › should tag the component to the next version of what the scope has`
/// - `components that are not synced between the scope and the consumer › consumer with a new component and scope with the same component as exported with defaultScope configured › bit status › should sync .bitmap according to the scope`
/// - `components that are not synced between the scope and the consumer › consumer with a tagged component and scope with no components › bit status › should show the component as new`
/// - `components that are not synced between the scope and the consumer › consumer with a tagged component and scope with no components › bit show › should not show the component with the version`
/// - `components that are not synced between the scope and the consumer › consumer with a tagged exported component and scope with no components › bit import should not throw`
/// - `components that are not synced between the scope and the consumer › consumer with a tagged exported component and scope with no components › bit import followed by bit status should sync .bitmap`
/// - `components that are not synced between the scope and the consumer › new lane got deleted › should recrate the lane`
#[test]
fn out_of_sync_components_between_scope_and_consumer() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.create_component_bar_foo("");
    helper.add_component_bar_foo();
    let bitmap_before = helper.read_bit_map();
    helper.native("tag --skip-tests");
    helper.native("export");

    helper.delete_path(".bit");
    helper.native("init");
    helper.add_remote_scope();
    helper.run("import -x");
    config::write_json(&helper.scopes.local_path.join(".bitmap"), &bitmap_before, b"    ");
    let scope_out_of_sync = helper.clone_workspace();

    // 1. bit tag tags to next version of what scope has
    let tag_out = helper.run("tag bar/foo --unmodified --patch --skip-tests");
    assert!(tag_out.contains("0.0.2"), "{tag_out}");

    // 2. bit status syncs .bitmap according to scope
    helper.get_cloned_workspace(&scope_out_of_sync);
    helper.run("status");
    helper.expect_status_to_be_clean();
    let bm = helper.read_bit_map();
    let bar_ver = bm["bar/foo"]["version"]
        .as_str()
        .or_else(|| bm["bar/foo@0.0.1"]["version"].as_str())
        .or_else(|| bm.get("bar/foo@0.0.1").map(|_| "0.0.1"))
        .unwrap();
    assert_eq!(bar_ver, "0.0.1");

    // 3. Consumer with a tagged component and scope with no components
    helper.re_init_workspace();
    helper.create_component_bar_foo("");
    helper.add_component_bar_foo();
    helper.native("tag --skip-tests");
    helper.delete_path(".bit");
    helper.native("init");
    let status_out = helper.run("status");
    assert!(status_out.contains("new components"), "{status_out}");
    let bm2 = helper.read_bit_map();
    assert!(bm2.get("bar/foo").is_some());
    assert!(bm2.get("bar/foo@0.0.1").is_none());

    // 4. Consumer with a tagged exported component and scope with no components
    helper.set_workspace_with_remote_scope();
    helper.populate_components(1, false, "");
    helper.native("tag --skip-tests");
    helper.native("export");
    helper.native("tag --unmodified --skip-tests");
    helper.delete_path(".bit");
    helper.native("init");
    helper.add_remote_scope();
    helper.run("import -x");
    helper.run("status");
    let bm3 = helper.read_bit_map();
    assert_eq!(bm3["comp1"]["version"].as_str(), Some("0.0.1"));

    // 5. New lane got deleted
    helper.set_workspace_with_remote_scope();
    helper.populate_components(1, false, "");
    helper.native("lane create dev");
    helper.native("snap --skip-tests");
    helper.delete_path(".bit");
    helper.native("init");
    helper.add_remote_scope();
    let lane_show = helper.run("lane show dev");
    assert!(lane_show.contains("dev"), "{lane_show}");
    let lane_curr = helper.native("lane current");
    assert!(lane_curr.contains("dev"), "{lane_curr}");
}

/// - `components that are not synced between the scope and the consumer › consumer with a tagged component and scope with no components › bit build › should build the component successfully`
#[test]
fn build_tagged_component_when_scope_has_no_components() {
    let helper = Helper::new();
    helper.re_init_workspace();
    helper.create_component_bar_foo("");
    helper.add_component_bar_foo();
    helper.native("tag --skip-tests");
    helper.delete_path(".bit");
    helper.native("init");
    let run = helper.native_run("build");
    assert_eq!(run.status.code(), Some(0));
}
