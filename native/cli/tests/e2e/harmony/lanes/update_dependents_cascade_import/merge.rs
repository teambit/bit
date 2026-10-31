//! Hidden lane entries need their origin's main objects before divergence planning.
use crate::helper::{Helper, parse};

#[test]
fn merging_cross_scope_hidden_updates_into_main_fetches_origin_history() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    let (origin, origin_path) = helper.new_bare_scope_connected();
    helper.populate_components(3, false, "");
    helper.native(&format!("scope set {origin} comp2"));
    helper.link("--rewire");
    helper.run("compile");
    helper.native("tag --skip-tests");
    helper.native("export");
    helper.native("lane create dev");
    helper.native("snap comp3 --skip-auto-snap --unmodified --skip-tests");
    helper.native("export");
    let lane = format!("{}/dev", helper.scopes.remote);
    let component = format!("{origin}/comp2");
    helper.seed_hidden_update_dependent(&component, &lane);
    helper.seed_hidden_update_dependent(&component, &lane);
    let remote_lane = parse(&Helper::cmd_in(&helper.scopes.remote_path, "cat-lane dev").stdout);
    let hidden = remote_lane["updateDependents"][0].as_str().unwrap();
    let expected = hidden.rsplit_once('@').unwrap().1;
    helper.re_init_workspace();
    helper.add_remote_scope();
    helper.add_remote(&origin_path);
    let merged = helper.native_run(&format!("lane merge {lane} -x"));
    assert!(merged.status.success(), "{merged:?}");
    assert!(merged.trace.contains("engine commandApply"), "{merged:?}");
    let model = parse(&helper.native(&format!("cat-component {component} --json")));
    assert_eq!(model["head"], expected);
}
