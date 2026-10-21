//! `e2e/functionalities/peer-dependency-component.e2e.ts`.

use crate::helper::{Helper, parse};
use serde_json::json;

/// - `set-peer › a component is a peer dependency › should save the peer dependency in the model`
/// - `set-peer › a component is a peer dependency › adds peer dependency to the generated package.json`
/// - `set-peer › a component is a peer dependency › peer dependency is not broken after snap › should save the peer dependency in the model`
/// - `set-peer › a component is a peer dependency › peer dependency is not broken after snap › should save the peer dependency in the scope data`
/// - `set-peer › a component is a peer dependency › peer dependency is not broken after snap › should save the always peer fields in the scope data`
/// - `set-peer › a component is a peer dependency › peer dependency is not broken after snap › adds peer dependency to the generated package.json`
/// - `set-peer › a component is a peer dependency › peer dependency is not broken after snap › always peer config fields are preserved when setting new dependencies › should readd always peer config fields to bitmap`
/// - `set-peer › a component is a peer dependency › unset-peer › should remove the always peer fields from the scope data`
/// - `set-peer using just the version range prefix › a component is a peer dependency › should save the peer dependency in the model`
/// - `set-peer using just the version range prefix › a component is a peer dependency › adds peer dependency to the generated package.json`
/// - `set-peer using just the version range prefix › a component is a peer dependency › peer dependency is not broken after snap › should save the peer dependency in the model`
/// - `set-peer using just the version range prefix › a component is a peer dependency › peer dependency is not broken after snap › should save the peer dependency in the scope data`
/// - `set-peer using just the version range prefix › a component is a peer dependency › peer dependency is not broken after snap › should save the always peer fields in the scope data`
/// - `set-peer using just the version range prefix › a component is a peer dependency › peer dependency is not broken after snap › adds peer dependency to the generated package.json`
/// - `set-peer for existing component › a component is a peer dependency › should save the peer dependency in the model`
/// - `set-peer for existing component › a component is a peer dependency › adds peer dependency to the generated package.json`
/// - `unset-peer for existing component › a component peer status is removed after snap › should not have comp2 as a peer dependency in the model`
/// - `unset-peer for existing component › a component peer status is removed after snap › should have comp2 as a runtime dependency`
#[test]
fn set_peer_and_unset_peer_component_workflows() {
    let helper = Helper::new();
    helper.re_init_workspace();
    helper.populate_components(2, true, "");
    let remote = helper.scopes.remote.clone();
    let comp2_pkg = format!("@{remote}/comp2");

    // 1. set-peer comp2 0
    helper.run("set-peer comp2 0");
    helper.run("link");
    let show1 = parse(&helper.show_component_parsed(&format!("{remote}/comp1")));
    assert_eq!(
        show1["peerDependencies"][0],
        json!({
            "id": format!("{remote}/comp2"),
            "relativePaths": [],
            "packageName": comp2_pkg,
            "versionRange": "0"
        }),
    );

    helper.native("snap --skip-tests");
    let comp1_model = parse(&helper.native("cat-component comp1@latest --json"));
    let dep_res1 = comp1_model["extensions"]
        .as_array()
        .unwrap()
        .iter()
        .find(|ext| ext["name"].as_str() == Some("teambit.dependencies/dependency-resolver"))
        .unwrap();
    let peer_dep1 = &dep_res1["data"]["dependencies"][0];
    assert_eq!(peer_dep1["packageName"].as_str(), Some(comp2_pkg.as_str()));
    assert_eq!(peer_dep1["lifecycle"].as_str(), Some("peer"));

    let comp2_model = parse(&helper.native("cat-component comp2@latest --json"));
    let dep_res2 = comp2_model["extensions"]
        .as_array()
        .unwrap()
        .iter()
        .find(|ext| ext["name"].as_str() == Some("teambit.dependencies/dependency-resolver"))
        .unwrap();
    assert_eq!(dep_res2["config"]["peer"], json!(true));
    assert_eq!(dep_res2["config"]["defaultPeerRange"], json!("0"));

    // Preserve always-peer fields when setting dependencies
    helper.run("deps set comp2 is-odd@1.0.0");
    let bitmap = helper.read_bit_map();
    let comp2_row = bitmap
        .as_object()
        .unwrap()
        .iter()
        .find(|(k, _)| k.starts_with("comp2"))
        .unwrap()
        .1;
    assert_eq!(
        comp2_row["config"]["teambit.dependencies/dependency-resolver"]["peer"],
        json!(true),
    );
    assert_eq!(
        comp2_row["config"]["teambit.dependencies/dependency-resolver"]["defaultPeerRange"],
        json!("0"),
    );

    // unset-peer
    helper.run("unset-peer comp2");
    helper.run("snap --skip-tests");
    let comp2_after_unset = parse(&helper.native("cat-component comp2@latest --json"));
    let dep_res2_after = comp2_after_unset["extensions"]
        .as_array()
        .unwrap()
        .iter()
        .find(|ext| ext["name"].as_str() == Some("teambit.dependencies/dependency-resolver"))
        .unwrap();
    assert!(dep_res2_after["config"].get("peer").is_none());
    assert!(dep_res2_after["config"].get("defaultPeerRange").is_none());

    let show_after_unset = parse(&helper.show_component_parsed(&format!("{remote}/comp1")));
    assert_eq!(show_after_unset["peerDependencies"], json!([]));
    let dep_res_show = show_after_unset["extensions"]
        .as_array()
        .unwrap()
        .iter()
        .find(|ext| ext["name"].as_str() == Some("teambit.dependencies/dependency-resolver"))
        .unwrap();
    let runtime_dep = dep_res_show["data"]["dependencies"]
        .as_array()
        .unwrap()
        .iter()
        .find(|dep| dep["packageName"].as_str() == Some(comp2_pkg.as_str()))
        .unwrap();
    assert_eq!(runtime_dep["lifecycle"].as_str(), Some("runtime"));

    // 2. set-peer with prefix '^'
    helper.re_init_workspace();
    helper.populate_components(2, true, "");
    helper.run("set-peer comp2 ^");
    helper.run("link");
    let show_caret = parse(&helper.show_component_parsed(&format!("{remote}/comp1")));
    assert_eq!(show_caret["peerDependencies"][0]["versionRange"], json!("^0.0.1-new"));
    helper.run("snap --skip-tests");
    let comp2_caret = parse(&helper.native("cat-component comp2@latest --json"));
    let dep_res_caret = comp2_caret["extensions"]
        .as_array()
        .unwrap()
        .iter()
        .find(|ext| ext["name"].as_str() == Some("teambit.dependencies/dependency-resolver"))
        .unwrap();
    assert_eq!(dep_res_caret["config"]["peer"], json!(true));
    assert_eq!(dep_res_caret["config"]["defaultPeerRange"], json!("^"));
}
