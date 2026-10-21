//! Additional tests for `e2e/harmony/checkout-harmony.e2e.ts`.

use crate::helper::Helper;

#[test]
fn checkout_head_and_latest_and_non_existing_local_version() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(1, false, "");
    helper.tag_all_without_build("");
    helper.populate_components(1, false, "v2");
    helper.tag_all_without_build("");
    helper.export("");
    let local_head_scope = helper.clone_workspace();
    helper.populate_components(1, false, "v3");
    helper.tag_all_without_build("");
    helper.export("");
    helper.get_cloned_workspace(&local_head_scope);
    helper.checkout("0.0.1 --all");
    helper.checkout_head("");
    assert_eq!(helper.read_bit_map()["comp1"]["version"].as_str(), Some("0.0.3"));

    helper.set_workspace_with_remote_scope();
    helper.populate_components(2, true, "");
    let scope_before_tag = helper.clone_workspace();
    helper.tag_without_build("comp2", "--skip-tests");
    helper.export("");
    helper.get_cloned_workspace(&scope_before_tag);
    assert_eq!(helper.status_json()["newComponents"].as_array().map_or(0, Vec::len), 2);
    helper.checkout_head("");
    assert_eq!(helper.status_json()["newComponents"].as_array().map_or(0, Vec::len), 1);
    assert_eq!(helper.read_bit_map()["comp2"]["scope"].as_str(), Some(helper.remote_scope()));

    helper.re_init_workspace();
    helper.populate_components(1, false, "");
    helper.tag_all_without_build("");
    helper.tag_all_without_build("--unmodified");
    helper.snap_all_components_without_build("--unmodified");
    helper.checkout_version("0.0.1", "comp1", "");
    let status = helper.status_json();
    let comp = &status["outdatedComponents"][0];
    let head = helper.get_head("comp1");
    assert_eq!(comp["latestVersion"].as_str(), Some("0.0.2"));
    assert_eq!(comp["headVersion"].as_str(), Some(head.as_str()));

    helper.checkout_latest("");
    assert_eq!(helper.read_bit_map()["comp1"]["version"].as_str(), Some("0.0.2"));
    helper.checkout_head("");
    assert_eq!(helper.read_bit_map()["comp1"]["version"].as_str(), Some(head.as_str()));

    assert_latest_without_tag_and_missing_local_version(&helper);
}

fn assert_latest_without_tag_and_missing_local_version(helper: &Helper) {
    helper.set_workspace_with_remote_scope();
    helper.populate_components(1, false, "");
    helper.snap_all_components_without_build("");
    let first_snap = helper.get_head("comp1");
    helper.export("");
    let after_first_snap = helper.clone_workspace();
    helper.snap_all_components_without_build("--unmodified");
    let second_snap = helper.get_head("comp1");
    helper.export("");
    helper.get_cloned_workspace(&after_first_snap);
    helper.checkout_latest("-x");
    let head = helper.get_head("comp1");
    assert_eq!(head, second_snap);
    assert_ne!(head, first_snap);

    helper.set_workspace_with_remote_scope();
    helper.populate_components(1, false, "");
    helper.tag_all_without_build("");
    helper.populate_components(1, false, "v2");
    helper.tag_all_without_build("");
    helper.export("");
    helper.re_init_workspace();
    helper.add_remote_scope();
    helper.import_component_without_install("comp1", "");
    let remote = helper.remote_scope().to_owned();
    let cat_err =
        helper.run_with_try_catch(&format!("bit cat-component {remote}/comp1@0.0.1 --json"));
    assert!(!cat_err.is_empty());
    helper.checkout_version("0.0.1", &format!("{remote}/comp1"), "");
}

#[test]
fn modified_without_conflicts_and_reset_and_short_hash_and_lanes() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(1, true, "");
    helper.output_file("comp1/index.js", "// first line\n\n");
    helper.tag_all_without_build("");
    helper.output_file("comp1/index.js", "// first line modified\n\n");
    helper.tag_all_without_build("");
    helper.export("");
    helper.checkout_version("0.0.1", "comp1", "-x");
    helper.append_file("comp1/index.js", "// second line\n");
    let before_checkout = helper.clone_workspace();

    helper.checkout_head("comp1 -x");
    assert!(
        helper.read_file("comp1/index.js").contains("// first line modified\n\n// second line"),
    );

    helper.get_cloned_workspace(&before_checkout);
    helper.checkout_head("comp1 -x --force-ours");
    assert!(helper.read_file("comp1/index.js").contains("// first line\n\n// second line"));

    helper.get_cloned_workspace(&before_checkout);
    helper.checkout_head("comp1 -x --force-theirs");
    assert!(helper.read_file("comp1/index.js").contains("// first line modified\n"));

    helper.set_workspace_with_remote_scope();
    helper.populate_components(1, true, "");
    helper.tag_all_without_build("");
    helper.export("");
    helper.eject_conf("comp1");
    helper.set_component_json_extension(
        "comp1",
        "teambit.pkg/pkg",
        serde_json::json!({ "name": "new-name" }),
    );
    assert_eq!(helper.status_json()["modifiedComponents"].as_array().map_or(0, Vec::len), 1);
    helper.checkout_reset("-a -x");
    assert_eq!(helper.status_json()["modifiedComponents"].as_array().map_or(0, Vec::len), 0);

    helper.set_workspace_with_remote_scope();
    helper.populate_components(3, true, "");
    helper.snap_all_components_without_build("");
    let snap1 = helper.get_head("comp1");
    helper.snap_all_components_without_build("--unmodified");
    helper.export("");
    helper.checkout_version(&snap1[..8], "comp1", "-x");
    assert_eq!(helper.read_bit_map()["comp1"]["version"].as_str(), Some(snap1.as_str()));
    let _ = helper.status();

    assert_lane_checkout_and_include_new_from_scope(&helper);
}

fn assert_lane_checkout_and_include_new_from_scope(helper: &Helper) {
    helper.set_workspace_with_remote_scope();
    helper.populate_components(1, true, "");
    helper.tag_all_without_build("");
    helper.tag_all_without_build("--unmodified");
    helper.export("");
    helper.create_lane("dev", "");
    helper.checkout_version("0.0.1", "comp1", "-x");
    assert_eq!(helper.read_bit_map()["comp1"]["version"].as_str(), Some("0.0.1"));

    helper.set_workspace_with_remote_scope();
    helper.populate_components(1, true, "");
    helper.tag_all_without_build("");
    helper.export("");
    helper.create_lane("dev", "");
    helper.delete_path("comp1");
    helper.checkout_reset("--all");
    assert!(
        helper
            .local_path()
            .join("comp1")
            .is_dir(),
    );
    assert_eq!(helper.status_json()["invalidComponents"].as_array().map_or(0, Vec::len), 0);

    helper.set_workspace_with_remote_scope();
    helper.populate_components(3, true, "");
    helper.tag_all_without_build("");
    helper.export("");
    helper.re_init_workspace();
    helper.add_remote_scope();
    helper.import_component_without_install("comp1", "");
    let before_checkout = helper.clone_workspace();

    helper.get_cloned_workspace(&before_checkout);
    helper.checkout_head("--skip-dependency-installation");
    assert_eq!(
        helper
            .list_parsed()
            .as_array()
            .map_or(0, Vec::len),
        1,
    );

    helper.get_cloned_workspace(&before_checkout);
    let output = helper.checkout_head("--skip-dependency-installation --include-new-from-scope");
    assert_eq!(
        helper
            .list_parsed()
            .as_array()
            .map_or(0, Vec::len),
        3,
    );
    assert!(output.contains("new components from scope"));
    assert!(output.contains("comp2"));
    assert!(output.contains("comp3"));
    assert!(output.contains("New from scope (imported)"));

    helper.get_cloned_workspace(&before_checkout);
    let err = helper.run_with_try_catch("bit checkout reset --include-new-from-scope");
    assert!(err.contains(
        r#"--include-new-from-scope is only relevant when running "bit checkout head""#
    ));
}
