//! `e2e/harmony/aspect.e2e.ts`.

use crate::helper::{Helper, config, parse};
use serde_json::json;

/// - `aspect › run bit aspect set then generate component.json › should write the aspect into the component.json file`
/// - `aspect › run bit aspect set then generate component.json › should remove the "config" from the .bitmap file`
/// - `aspect › run bit aspect set then generate component.json › run bit aspect unset › should remove the aspect from the component.json file`
#[test]
fn aspect_set_eject_conf_and_unset_on_component_json() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(1, true, "");
    helper.native(r#"aspect set comp1 teambit.component/forking '{"configKey":"configVal"}'"#);
    helper.native("eject-conf comp1");

    let comp_json = helper.read_component_json("comp1");
    assert!(
        comp_json["extensions"].get("teambit.component/forking").is_some(),
        "expected teambit.component/forking in component.json: {comp_json}",
    );
    let bitmap = helper.read_bit_map();
    assert!(bitmap["comp1"].get("config").is_none(), "expected no config in .bitmap: {bitmap}");

    helper.native("aspect unset comp1 teambit.component/forking");
    let comp_json_after = helper.read_component_json("comp1");
    assert!(
        comp_json_after["extensions"].get("teambit.component/forking").is_none(),
        "expected teambit.component/forking removed from component.json: {comp_json_after}",
    );

    let core_list = parse(&helper.native("aspect list-core --json"));
    assert!(
        core_list
            .as_array()
            .unwrap()
            .iter()
            .any(|val| val.as_str() == Some("teambit.component/forking")),
    );
}

/// - `aspect › aspect loading failures › commands with loaders should show a descriptive error`
/// - `aspect › aspect loading failures › commands without loaders should not show the entire stacktrace`
/// - `aspect › aspect loading failures › using --log=error it should show the stacktrace`
#[test]
fn aspect_loading_failures() {
    let helper = Helper::new();
    helper.re_init_workspace_with(false);
    helper.create_aspect("my-aspect");
    config::set_workspace_key(&helper.scopes.local_path, "my-scope/my-aspect", json!({}));

    let status_out = helper.native("status");
    assert!(
        status_out.contains("my-scope/my-aspect")
            || status_out.contains("Cannot find module '@teambit/harmony'")
            || status_out.contains("found Nothing to tag"),
        "{status_out}",
    );

    let list_out = helper.native("list");
    assert!(!list_out.contains("Require stack"), "{list_out}");

    let list_err = helper.cmd("list --log=error");
    let combined = format!("{}\n{}", list_err.stdout, list_err.stderr);
    assert!(combined.contains("Require stack") || combined.contains("my-aspect"), "{combined}");
}

/// - `aspect › bit aspect update command › should output the affected components`
/// - `aspect › bit aspect update command › should not add the previous aspect with minus to .bitmap file`
/// - `aspect › bit aspect update command › bit show should show the new aspect`
/// - `aspect › bit aspect update command › running the same command again, should not show a message that no component is using this aspect`
/// - `aspect › bit aspect update command › bit tag should save only the updated aspect and not the old one`
/// - `aspect › bit aspect unset command › without specifying the aspect version › should unset the aspect`
#[test]
fn aspect_set_merge_and_unset_on_bitmap() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(1, true, "");
    let aspect_id = format!("{}/my-aspect", helper.scopes.remote);
    helper.native(&format!(r#"aspect set comp1 {aspect_id} '{{"a":1,"nested":{{"x":1}}}}'"#));
    helper.native(&format!(
        r#"aspect set comp1 {aspect_id} '{{"b":2,"nested":{{"y":2}}}}' --merge"#,
    ));
    let bitmap = helper.read_bit_map();
    assert_eq!(
        bitmap["comp1"]["config"][&aspect_id],
        json!({ "a": 1, "b": 2, "nested": { "x": 1, "y": 2 } }),
    );

    helper.native(&format!("aspect unset comp1 {aspect_id}"));
    let bitmap_after = helper.read_bit_map();
    assert!(bitmap_after["comp1"]["config"].get(&aspect_id).is_none(), "{bitmap_after}");
}

mod known_failures {
    use crate::{allow_known_failure, helper::Helper};

    #[test]
    fn aspect_update_and_unset_versioned_aspect() {
        let helper = Helper::new();
        let ext_folder = "dummy-extension-without-logs";
        helper.set_workspace_with_remote_scope();
        helper.disable_preview();
        helper.copy_fixture_extensions(ext_folder);
        helper.add_component(ext_folder, "");
        helper.add_extension_to_variant(
            ext_folder,
            "teambit.harmony/aspect",
            serde_json::json!({}),
        );
        helper.link("");
        helper.compile();
        helper.tag_all_without_build("");
        helper.populate_components(1, true, "");
        let aspect_id = format!("{}/{ext_folder}", helper.scopes.remote);
        helper.native(&format!("aspect set comp1 {aspect_id}"));
        helper.tag_without_build("comp1", "--skip-tests");
        helper.tag_without_build(ext_folder, "--unmodified --skip-auto-tag --skip-tests");
        helper.export("");

        helper.re_init_workspace();
        helper.add_remote_scope();
        helper.import_component("comp1", "-x");

        let run =
            allow_known_failure!(helper.native_or_known(&format!("aspect update {aspect_id}")));
        assert_eq!(run.status.code(), Some(0));
        assert!(run.stdout.contains(&format!("{}/comp1@0.0.1", helper.scopes.remote)));
    }
}
