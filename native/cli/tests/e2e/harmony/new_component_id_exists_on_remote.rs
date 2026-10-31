//! `e2e/harmony/new-component-id-exists-on-remote.e2e.ts`.

use crate::helper::Helper;

/// - `creating a new component whose id already exists on the remote › bit add of a component with the same id as an existing remote component (unrelated history) › should warn that the component already exists on the remote scope`
/// - `creating a new component whose id already exists on the remote › bit add of a component with the same id as an existing remote component (unrelated history) › should suggest "bit import" to adopt the existing component`
/// - `creating a new component whose id already exists on the remote › bit add of a component with the same id as an existing remote component (unrelated history) › should suggest "bit rename" to keep it as a separate component`
/// - `creating a new component whose id already exists on the remote › bit add of a component with the same id as an existing remote component (unrelated history) › should still track the component (the warning is non-blocking)`
/// - `creating a new component whose id already exists on the remote › bit add when the id does not legitimately collide › should not warn for an already-exported component`
/// - `creating a new component whose id already exists on the remote › bit add when the id does not legitimately collide › should not warn for a brand new id that does not exist on the remote`
#[test]
fn new_component_id_exists_on_remote_warning_and_non_collision() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(1, true, "");
    helper.native("tag --skip-tests");
    helper.native("export");
    let exported_ws = helper.clone_workspace();

    // 1. Unrelated component with same id in fresh workspace warns
    helper.re_init_workspace();
    helper.add_remote_scope();
    helper.output_file("comp1/index.js", "module.exports = () => 'unrelated';");
    let add_out = helper.native("add comp1");
    assert!(add_out.contains("already exist on the remote scope"), "{add_out}");
    assert!(add_out.contains("bit import"), "{add_out}");
    assert!(add_out.contains("bit rename"), "{add_out}");
    let bm = helper.read_bit_map();
    assert!(bm.get("comp1").is_some());

    // 2. Re-adding already-exported component or adding brand-new id does not warn
    helper.get_cloned_workspace(&exported_ws);
    helper.output_file("comp1/index.js", "module.exports = () => 'comp1 v2';");
    let readd_out = helper.native("add comp1");
    assert!(!readd_out.contains("already exist on the remote scope"), "{readd_out}");

    helper.output_file("comp-new/index.js", "module.exports = () => 'new';");
    let new_out = helper.native("add comp-new");
    assert!(!new_out.contains("already exist on the remote scope"), "{new_out}");
}
