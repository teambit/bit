//! `e2e/harmony/component-config.e2e.ts`.

use crate::helper::{Helper, parse};
use serde_json::{Value, json};

/// - `component config › eject config › eject for new component › expect to output the path of the config`
/// - `component config › eject config › eject for new component › component json content › expect to have the component id`
/// - `component config › eject config › eject for new component › component json content › expect to have the propagate false by default`
/// - `component config › eject config › eject for new component › component json content › expect to write a component json with no extensions`
/// - `component config › eject config › eject for new component › using propagate true flag › expect to have the propagate true`
/// - `component config › eject config › eject for new component › when file already existing › should throw error if override not used`
/// - `component config › eject config › eject for new component › when file already existing › should success if override used`
/// - `component config › eject config › eject for new component › when there are variant extensions defined › should not have extensions from models in component.json`
#[test]
fn eject_config_for_new_component() {
    let helper = Helper::new();
    helper.re_init_workspace_with(false);
    helper.create_component_bar_foo("");
    helper.add_component_bar_foo();

    let output = helper.native("eject-conf bar/foo");
    assert!(output.replace('\\', "/").contains("bar/component.json"), "{output}");

    let comp_json = helper.read_component_json("bar");
    assert_eq!(
        comp_json["componentId"],
        json!({
            "scope": "my-scope",
            "name": "bar/foo"
        }),
    );
    assert_eq!(comp_json["propagate"], json!(false));
    assert_eq!(comp_json["extensions"], json!({}));

    helper.delete_component_json_if_exist("bar");
    helper.native("eject-conf bar/foo --propagate");
    let comp_json_prop = helper.read_component_json("bar");
    assert_eq!(comp_json_prop["propagate"], json!(true));

    helper.delete_component_json_if_exist("bar");
    helper.native("eject-conf bar/foo");
    let err_run = helper.native_run("eject-conf bar/foo");
    assert_ne!(err_run.status.code(), Some(0));
    let combined = format!("{}\n{}", err_run.stdout, err_run.stderr);
    assert!(combined.contains("already exists"), "{combined}");

    let override_out = helper.native("eject-conf bar/foo --override");
    assert!(override_out.replace('\\', "/").contains("bar/component.json"));

    helper.delete_component_json_if_exist("bar");
    helper.copy_fixture_extensions("dummy-extension");
    helper.add_component("dummy-extension", "");
    helper.add_extension_to_variant(
        "bar",
        "default-scope/dummy-extension",
        json!({ "key": "val" }),
    );
    helper.native("eject-conf bar/foo");
    let comp_json_variant = helper.read_component_json("bar");
    assert_eq!(comp_json_variant["extensions"], json!({}));
}

/// - `component config › eject config › eject for tagged component › should have extensions from models in component.json`
#[test]
fn eject_config_for_tagged_component() {
    let helper = Helper::new();
    helper.re_init_workspace_with(false);
    helper.create_component_bar_foo("");
    helper.add_component_bar_foo();
    helper.copy_fixture_extensions("dummy-extension");
    helper.add_component("dummy-extension", "");
    let mut ws = helper.read_workspace_jsonc();
    ws["teambit.workspace/variants"] = json!({
        "bar": {
            "my-scope/dummy-extension": { "key": "val" }
        },
        "dummy-extension": {
            "teambit.harmony/aspect": {}
        }
    });
    helper.write_workspace_jsonc(&ws);
    helper.run("install");
    helper.compile();
    helper.native("tag --skip-tests");
    helper.run("eject-conf bar/foo");
    let comp_json = helper.read_component_json("bar");
    assert_eq!(comp_json["extensions"]["my-scope/dummy-extension@0.0.1"], json!({ "key": "val" }));
}

fn filter_configured_extensions(show_legacy: &Value) -> Vec<(String, Value)> {
    show_legacy["extensions"]
        .as_array()
        .unwrap()
        .iter()
        .filter_map(|entry| {
            let mut cfg = entry["config"].clone();
            {
                let obj = cfg.as_object_mut()?;
                obj.remove("__specific");
                if obj.is_empty() {
                    return None;
                }
            }
            Some((entry["extensionId"].as_str()?.to_owned(), cfg))
        })
        .collect()
}

/// - `component config › propagation › stop on component.json - component.json propagate false › should only has extensions defined in component.json`
/// - `component config › propagation › stop on variant - component.json propagate true and variant propagate false › should not contain extension from workspace defaults`
/// - `component config › propagation › stop on variant - component.json propagate true and variant propagate false › should prefer config from component json when there is conflict`
/// - `component config › propagation › stop on variant - component.json propagate true and variant propagate false › should has extensions from the variant`
/// - `component config › propagation › propagate all the way - component.json propagate true and variant propagate true › should contain extension from all sources`
/// - `component config › propagation › propagate all the way - component.json propagate true and variant propagate true › should prefer config from component json when there is conflicts with variant or with workspace defaults`
/// - `component config › propagation › propagate all the way - component.json propagate true and variant propagate true › should prefer config from variant when there is conflicts with workspace defaults`
/// - `component config › propagation › propagate all the way - component.json propagate true and variant propagate true › should has extensions from the workspace defaults`
#[test]
fn component_config_propagation() {
    let helper = Helper::new();
    helper.re_init_workspace_with(false);
    helper.populate_extensions(5);
    helper.create_component_bar_foo("");
    helper.add_component_bar_foo();

    helper.add_extension_to_variant("*", "my-scope/ext1", json!({ "key": "val-ws-defaults" }));
    helper.add_extension_to_variant("*", "my-scope/ext2", json!({ "key": "val-ws-defaults" }));
    helper.add_extension_to_variant("*", "my-scope/ext5", json!({ "key": "val-ws-defaults" }));
    helper.add_extension_to_variant("extensions", "teambit.harmony/aspect", json!({}));
    helper.add_extension_to_variant("extensions", "propagate", json!(false));
    helper.run("install");
    helper.compile();

    helper.add_extension_to_variant("bar", "my-scope/ext2", json!({ "key": "val-variant" }));
    helper.add_extension_to_variant("bar", "my-scope/ext3", json!({ "key": "val-variant" }));
    helper.add_extension_to_variant("bar", "my-scope/ext4", json!({ "key": "val-variant" }));
    helper.native("eject-conf bar/foo");
    helper.set_component_json_extension(
        "bar",
        "my-scope/ext4",
        json!({ "key": "val-component-json" }),
    );
    helper.set_component_json_extension(
        "bar",
        "my-scope/ext5",
        json!({ "key": "val-component-json" }),
    );

    // 1. propagate = false on component.json
    helper.set_component_json_propagate("bar", false);
    let show1 = parse(&helper.show_component_parsed("bar/foo"));
    let exts1 = filter_configured_extensions(&show1);
    assert_eq!(exts1.len(), 2);
    assert!(exts1.contains(&("my-scope/ext4".into(), json!({ "key": "val-component-json" }))));
    assert!(exts1.contains(&("my-scope/ext5".into(), json!({ "key": "val-component-json" }))));

    // 2. propagate = true on component.json, propagate = false on variant
    helper.set_component_json_propagate("bar", true);
    helper.add_extension_to_variant("bar", "propagate", json!(false));
    let show2 = parse(&helper.show_component_parsed("bar/foo"));
    let exts2 = filter_configured_extensions(&show2);
    assert_eq!(exts2.len(), 4);
    assert!(exts2.contains(&("my-scope/ext4".into(), json!({ "key": "val-component-json" }))));
    assert!(exts2.contains(&("my-scope/ext5".into(), json!({ "key": "val-component-json" }))));
    assert!(exts2.contains(&("my-scope/ext2".into(), json!({ "key": "val-variant" }))));
    assert!(exts2.contains(&("my-scope/ext3".into(), json!({ "key": "val-variant" }))));

    // 3. propagate = true on component.json and variant
    helper.set_component_json_propagate("bar", true);
    helper.add_extension_to_variant("bar", "propagate", json!(true));
    let show3 = parse(&helper.show_component_parsed("bar/foo"));
    let exts3 = filter_configured_extensions(&show3);
    assert_eq!(exts3.len(), 5);
    assert!(exts3.contains(&("my-scope/ext1".into(), json!({ "key": "val-ws-defaults" }))));
    assert!(exts3.contains(&("my-scope/ext2".into(), json!({ "key": "val-variant" }))));
    assert!(exts3.contains(&("my-scope/ext3".into(), json!({ "key": "val-variant" }))));
    assert!(exts3.contains(&("my-scope/ext4".into(), json!({ "key": "val-component-json" }))));
    assert!(exts3.contains(&("my-scope/ext5".into(), json!({ "key": "val-component-json" }))));
}
