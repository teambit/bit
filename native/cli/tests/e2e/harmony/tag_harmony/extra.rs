use crate::helper::Helper;

#[test]
fn detached_head_branches_and_export_flows() {
    let helper = Helper::new();

    // 1. maintain two main branches 1.x and 2.x, tagging the older branch 1.x with a patch
    helper.set_workspace_with_remote_scope();
    helper.populate_components(1, true, "");
    helper.tag_all_without_build("--ver 1.0.0");
    helper.populate_components(1, true, "version2");
    helper.tag_all_without_build("--ver 2.0.0");
    let ver2_head = helper.get_head("comp1");
    helper.export("");
    helper.checkout_version("1.0.0", "comp1", "-x");
    helper.populate_components(1, true, "version101");
    helper.tag_all_without_build("--ver 1.0.1 --detach-head");
    helper.export("");

    let comp = helper.cat_component_parsed("comp1");
    assert_eq!(comp["head"].as_str(), Some(ver2_head.as_str()));
    let bitmap = helper.read_bit_map();
    assert_eq!(bitmap["comp1"]["version"].as_str(), Some("1.0.1"));

    helper.re_init_workspace();
    helper.add_remote_scope();
    helper.import_component("comp1", "-x");
    let bitmap = helper.read_bit_map();
    assert_eq!(bitmap["comp1"]["version"].as_str(), Some("2.0.0"));

    // 2. export with detached-head when head was not exported yet
    helper.set_workspace_with_remote_scope();
    helper.populate_components(1, true, "");
    helper.tag_all_without_build("");
    helper.export("");

    helper.tag_all_without_build("--ver 2.0.0 --unmodified");
    let comp = helper.cat_component_parsed(&format!("{}/comp1", helper.remote_scope()));
    let version_hash_2_0_0 = comp["versions"]["2.0.0"]
        .as_str()
        .expect("2.0.0 hash")
        .to_string();

    helper.run_cmd("bit checkout 0.0.1 --all -x");
    helper.tag_all_without_build("--unmodified --detach-head");
    let comp_after_detach =
        helper.cat_component_parsed(&format!("{}/comp1", helper.remote_scope()));
    let version_hash_2_0_1 = comp_after_detach["versions"]["2.0.1"]
        .as_str()
        .expect("2.0.1 hash")
        .to_string();

    helper.export("");

    let remote_comp = helper.cat_component_in_parsed(
        &format!("{}/comp1", helper.remote_scope()),
        helper.remote_path(),
    );
    assert!(remote_comp["versions"].get("2.0.0").is_some());
    assert!(remote_comp["versions"].get("2.0.1").is_some());
    let _ =
        helper.run_cmd_in(&format!("bit cat-object {version_hash_2_0_0}"), helper.remote_path());
    let _ =
        helper.run_cmd_in(&format!("bit cat-object {version_hash_2_0_1}"), helper.remote_path());

    helper.re_init_workspace();
    helper.add_remote_scope();
    helper.import_component("comp1", "-x");
    let comp = helper.cat_component_parsed(&format!("{}/comp1", helper.remote_scope()));
    assert!(comp["versions"].get("2.0.0").is_some());
    let _ = helper.cat_object(&version_hash_2_0_0, false);

    // 3. export with detached-head when head and its parent were not exported yet
    helper.set_workspace_with_remote_scope();
    helper.populate_components(1, true, "");
    helper.tag_all_without_build("");
    helper.export("");

    helper.tag_all_without_build("--ver 2.0.0 --unmodified");
    let comp = helper.cat_component_parsed(&format!("{}/comp1", helper.remote_scope()));
    let version_hash_2_0_0 = comp["versions"]["2.0.0"]
        .as_str()
        .expect("2.0.0 hash")
        .to_string();

    helper.snap_all_components_without_build("--unmodified");
    let comp_after_snap = helper.cat_component_parsed(&format!("{}/comp1", helper.remote_scope()));
    let snap_hash = comp_after_snap["head"]
        .as_str()
        .expect("snap hash")
        .to_string();

    helper.tag_all_without_build("--ver 2.0.1 --unmodified");
    let comp2 = helper.cat_component_parsed(&format!("{}/comp1", helper.remote_scope()));
    let version_hash_2_0_1 = comp2["versions"]["2.0.1"]
        .as_str()
        .expect("2.0.1 hash")
        .to_string();

    helper.run_cmd("bit checkout 0.0.1 --all -x");
    helper.tag_all_without_build("--unmodified --detach-head");
    let comp_after_detach =
        helper.cat_component_parsed(&format!("{}/comp1", helper.remote_scope()));
    let version_hash_2_0_2 = comp_after_detach["versions"]["2.0.2"]
        .as_str()
        .expect("2.0.2 hash")
        .to_string();

    helper.export("");

    let remote_comp = helper.cat_component_in_parsed(
        &format!("{}/comp1", helper.remote_scope()),
        helper.remote_path(),
    );
    assert!(remote_comp["versions"].get("2.0.0").is_some());
    assert!(remote_comp["versions"].get("2.0.1").is_some());
    assert!(remote_comp["versions"].get("2.0.2").is_some());
    assert_eq!(remote_comp["head"].as_str(), Some(version_hash_2_0_1.as_str()));

    let _ =
        helper.run_cmd_in(&format!("bit cat-object {version_hash_2_0_0}"), helper.remote_path());
    let _ = helper.run_cmd_in(&format!("bit cat-object {snap_hash}"), helper.remote_path());
    let _ =
        helper.run_cmd_in(&format!("bit cat-object {version_hash_2_0_1}"), helper.remote_path());
    let _ =
        helper.run_cmd_in(&format!("bit cat-object {version_hash_2_0_2}"), helper.remote_path());

    helper.re_init_workspace();
    helper.add_remote_scope();
    helper.import_component("comp1", "-x");
    let comp = helper.cat_component_parsed(&format!("{}/comp1", helper.remote_scope()));
    assert!(comp["versions"].get("2.0.0").is_some());
    assert!(comp["versions"].get("2.0.1").is_some());
    assert!(comp["versions"].get("2.0.2").is_some());
    let _ = helper.cat_object(&version_hash_2_0_1, false);
    helper.import_component(&format!("comp1@{snap_hash}"), "-x --override");

    // 4. export with --detach-head after merging a lane
    helper.set_workspace_with_remote_scope();
    helper.populate_components(1, true, "");
    helper.tag_all_without_build("--ver 1.0.0");
    helper.export("");

    helper.create_lane("dev", "");
    helper.snap_all_components_without_build("--unmodified");
    let first_snap_on_lane = helper.head_of_lane("dev", "comp1");
    helper.snap_all_components_without_build("--unmodified");
    let head_on_lane = helper.head_of_lane("dev", "comp1");
    helper.export("");

    helper.switch_local_lane("main", "-x");
    helper.tag_all_without_build("--unmodified --ver 2.0.0");
    let head_on_main = helper.get_head("comp1");

    helper.merge_lane_without_build("dev", "--detach-head -x");
    helper.export("");

    let remote_comp = helper.cat_component_in_parsed(
        &format!("{}/comp1", helper.remote_scope()),
        helper.remote_path(),
    );
    assert!(remote_comp["versions"].get("2.0.0").is_some());
    let _ = helper.run_cmd_in(&format!("bit cat-object {head_on_main}"), helper.remote_path());
    let _ =
        helper.run_cmd_in(&format!("bit cat-object {first_snap_on_lane}"), helper.remote_path());
    let _ = helper.run_cmd_in(&format!("bit cat-object {head_on_lane}"), helper.remote_path());
}
