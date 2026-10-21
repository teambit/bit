//! `e2e/flows/out-of-sync-componets.e2e.ts`.

use crate::helper::Helper;

#[test]
fn consumer_with_a_new_component_and_scope_with_the_same_component_as_staged() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.create_component_bar_foo("");
    helper.add_component_bar_foo();
    let new_state = helper.clone_bit_map();
    helper.tag_all_without_build("");
    helper.restore_bit_map(&new_state);
    let out_of_sync = helper.clone_workspace();

    // 1. bit tag: should tag the component to the next version of what the scope has
    let output = helper.run_cmd("tag bar/foo --unmodified --patch");
    assert!(output.contains("0.0.2"));

    // 2. bit status: should sync .bitmap according to the scope
    helper.get_cloned_workspace(&out_of_sync);
    let output = helper.status();
    assert!(output.contains("staged"));
    let bitmap = helper.read_bit_map();
    assert_eq!(bitmap["bar/foo"]["version"].as_str().unwrap(), "0.0.1");

    // 3. bit export with id: should export the component successfully
    helper.get_cloned_workspace(&out_of_sync);
    helper.re_init_remote_scope();
    let output = helper.export("bar/foo");
    assert!(output.contains("exported components (1)"), "{output}");

    // 4. bit export all: should export the component successfully
    helper.get_cloned_workspace(&out_of_sync);
    helper.re_init_remote_scope();
    let output = helper.export("");
    assert!(output.contains("exported components (1)"), "{output}");
}

#[test]
fn consumer_with_a_tagged_component_and_scope_with_the_same_component_as_exported() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.create_component_bar_foo("");
    helper.add_component_bar_foo();
    helper.tag_all_without_build("");
    let tagged_state = helper.clone_bit_map();
    helper.export("");
    helper.restore_bit_map(&tagged_state);
    let out_of_sync = helper.clone_workspace();

    // 1. bit tag: should tag the component to the next version of what the scope has
    let output = helper.run_cmd("tag bar/foo --unmodified --patch");
    assert!(output.contains("0.0.2"));

    // 2. bit status: should sync .bitmap according to the scope
    helper.get_cloned_workspace(&out_of_sync);
    let status = helper.status();
    helper.expect_status_to_be_clean_from_output(&status);
    let bitmap = helper.read_bit_map();
    assert_eq!(bitmap["bar/foo"]["version"].as_str().unwrap(), "0.0.1");
    assert_eq!(bitmap["bar/foo"]["scope"].as_str().unwrap(), helper.scopes.remote);
}

#[test]
fn consumer_with_no_components_and_scope_with_staged_or_exported_components() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.create_component_bar_foo("");
    helper.add_component_bar_foo();
    helper.tag_all_without_build("");
    helper.delete_path(".bitmap");
    helper.run_cmd("init --force");
    let out_of_sync = helper.clone_workspace();

    // 1. bit show: should not throw because "bit show" supports showing components from the scope
    assert!(helper.try_cmd("show bar/foo").status.success());

    // 2. bit export all: should export the component successfully and tell the user that no local changes have been made
    let output = helper.export("");
    let ls_remote = helper.list_remote_scope_parsed("");
    assert_eq!(ls_remote.as_array().unwrap().len(), 1);
    assert!(output.contains(
        "bit did not update the workspace as the component files are not tracked"
    ));

    // 3. bit export id: should throw an error saying the component does not exist
    helper.get_cloned_workspace(&out_of_sync);
    helper.re_init_remote_scope();
    let err = helper.try_cmd("export bar/foo");
    assert!(!err.status.success());
    let combined = format!("{}{}", err.stdout, err.stderr);
    assert!(combined.contains("bar/foo"), "{combined}");

    // 4. consumer with no components and scope with exported components: bit add of the same component
    let helper2 = Helper::new();
    helper2.set_workspace_with_remote_scope();
    helper2.create_component_bar_foo("");
    helper2.add_component_bar_foo();
    helper2.tag_all_without_build("");
    helper2.export("");
    helper2.delete_path(".bitmap");
    helper2.run_cmd("init --force");
    helper2.add_component_bar_foo();
    let bitmap = helper2.read_bit_map();
    assert_eq!(bitmap["bar/foo"]["version"].as_str().unwrap(), "0.0.1");
    assert_eq!(bitmap["bar/foo"]["scope"].as_str().unwrap(), helper2.scopes.remote);
}

#[test]
fn consumer_has_exported_components_and_scope_is_empty() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.create_component_bar_foo("");
    helper.add_component_bar_foo();
    helper.tag_all_without_build("");
    helper.export("");
    helper.delete_path(".bit");
    let out_of_sync = helper.clone_workspace();

    // 1. bit tag: should stop the tagging process and throw an error suggesting to import the components
    let err = helper.try_cmd("tag bar/foo --unmodified");
    assert!(!err.status.success());
    let combined = format!("{}{}", err.stdout, err.stderr);
    assert!(combined.to_lowercase().contains("your workspace has outdated objects"), "{combined}");

    // 2. bit status: should show a message suggesting to import the components
    helper.get_cloned_workspace(&out_of_sync);
    let output = helper.status();
    assert!(output.to_lowercase().contains("your workspace has outdated objects"), "{output}");
}

#[test]
fn consumer_has_tagged_or_exported_component_with_a_version_that_not_exist_in_the_scope() {
    // 1. consumer has tagged component with a version that not exist in the scope
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.create_component_bar_foo("");
    helper.add_component_bar_foo();
    helper.tag_all_without_build("");
    helper.run_cmd("tag --unmodified --ver 2.0.0");
    let bitmap_v2 = helper.clone_bit_map();
    helper.run_cmd("reset bar/foo --head");
    helper.restore_bit_map(&bitmap_v2);
    let out_of_sync = helper.clone_workspace();

    let output = helper.run_cmd("tag bar/foo --unmodified --patch");
    assert!(output.contains("0.0.2"));

    helper.get_cloned_workspace(&out_of_sync);
    let output = helper.status();
    assert!(output.contains("staged components"));
    let bitmap = helper.read_bit_map();
    assert_eq!(bitmap["bar/foo"]["version"].as_str().unwrap(), "0.0.1");

    // 2. consumer has exported component with a version that not exist in the scope
    let helper2 = Helper::new();
    helper2.set_workspace_with_remote_scope();
    helper2.create_component_bar_foo("");
    helper2.add_component_bar_foo();
    helper2.tag_all_without_build("");
    helper2.export("");
    let scope_after_v1 = helper2.clone_workspace();
    helper2.run_cmd("tag --unmodified --ver 2.0.0");
    helper2.export("");
    let bitmap_v2_2 = helper2.clone_bit_map();
    helper2.get_cloned_workspace(&scope_after_v1);
    helper2.restore_bit_map(&bitmap_v2_2);
    let out_of_sync2 = helper2.clone_workspace();

    // when the remote component has this missing version
    for cmd in ["status", "show bar/foo", "tag"] {
        helper2.get_cloned_workspace(&out_of_sync2);
        let err = helper2.try_cmd(cmd);
        assert!(!err.status.success(), "{cmd} should have failed");
        let combined = format!("{}{}", err.stdout, err.stderr);
        assert!(
            combined.to_lowercase().contains("your workspace has outdated objects"),
            "{cmd}: {combined}",
        );
    }

    // when the remote component does not exist or does not have this missing version
    helper2.get_cloned_workspace(&out_of_sync2);
    helper2.re_init_remote_scope();
    let status = helper2.status();
    helper2.expect_status_to_be_clean_from_output(&status);
    let bitmap = helper2.read_bit_map();
    assert_eq!(bitmap["bar/foo"]["version"].as_str().unwrap(), "0.0.1");

    helper2.get_cloned_workspace(&out_of_sync2);
    helper2.re_init_remote_scope();
    let output = helper2.run_cmd("tag bar/foo --unmodified --patch");
    assert!(output.contains("0.0.2"));
}
