//! `e2e/functionalities/peer-dependencies.e2e.ts`.

use crate::helper::{Helper, parse};
use serde_json::json;

/// - `peer-dependencies functionality › when a package is a regular dependency and a peer dependency › should save the peer dependencies in the model`
/// - `peer-dependencies functionality › when a package is a regular dependency and a peer dependency › should not save the peer-dependency as a package-dependency nor as a dev-package-dependency`
/// - `peer-dependencies functionality › when a package is a regular dependency and a peer dependency › bit show should display the peer dependencies`
/// - `peer-dependencies functionality › when a package is a regular dependency and a peer dependency › when the component is imported › should not be shown as modified`
/// - `peer-dependencies functionality › when a package is only a peer dependency but not required in the code › should not save the peer dependencies in the model`
#[test]
fn peer_dependencies_regular_and_unused_in_code() {
    let helper = Helper::new();
    helper.re_init_workspace();
    let mut ws = helper.read_workspace_jsonc();
    ws["teambit.dependencies/dependency-resolver"]["policy"]["peerDependencies"] =
        json!({ "chai": ">= 2.1.2 < 5" });
    helper.write_workspace_jsonc(&ws);
    helper.npm_add_fake_package("chai", "2.4", false);
    helper.create_component_bar_foo("import chai from 'chai';");
    helper.add_component_bar_foo();
    helper.native("tag bar/foo --skip-tests");

    let cat_comp = parse(&helper.native("cat-component bar/foo@latest --json"));
    assert_eq!(cat_comp["peerPackageDependencies"]["chai"], json!(">= 2.1.2 < 5"));
    assert!(cat_comp["packageDependencies"].get("chai").is_none());
    assert!(cat_comp["devPackageDependencies"].get("chai").is_none());

    let show = parse(&helper.show_component_parsed("bar/foo"));
    assert_eq!(show["peerPackageDependencies"]["chai"], json!(">= 2.1.2 < 5"));

    helper.re_init_remote_scope();
    helper.add_remote_scope();
    let remote = helper.scopes.remote.clone();
    helper.add_default_scope(&remote);
    helper.native("export");

    helper.re_init_workspace();
    helper.add_remote_scope();
    helper.native(&format!("import {remote}/bar/foo -x"));
    helper.npm_add_fake_package("chai", "2.4", false);
    helper.expect_status_to_be_clean();

    // Package is only a peer dependency but not required in code
    helper.re_init_workspace();
    let mut ws2 = helper.read_workspace_jsonc();
    ws2["teambit.dependencies/dependency-resolver"]["policy"]["peerDependencies"] =
        json!({ "chai": ">= 2.1.2 < 5" });
    helper.write_workspace_jsonc(&ws2);
    helper.npm_add_fake_package("chai", "2.4", false);
    helper.create_component_bar_foo("");
    helper.add_component_bar_foo();
    helper.native("tag bar/foo --skip-tests");
    let cat_unused = parse(&helper.native("cat-component bar/foo@latest --json"));
    assert!(cat_unused["peerPackageDependencies"].get("chai").is_none());
}

/// - `peer-dependencies functionality › a component is a peer dependency › should save the peer dependency in the model`
/// - `peer-dependencies functionality › a component is a peer dependency › adds peer dependency to the generated package.json`
/// - `peer-dependencies functionality › a component is a peer dependency › installs a hidden peer in the workspace but excludes it from the capsule manifest`
/// - `peer-dependencies functionality › peer dependency is not broken after snap › should save the peer dependency in the model`
/// - `peer-dependencies functionality › peer dependency is not broken after snap › should save the peer dependency in the scope data`
/// - `peer-dependencies functionality › peer dependency is not broken after snap › adds peer dependency to the generated package.json`
#[test]
fn component_as_peer_dependency_and_after_snap() {
    let helper = Helper::new();
    helper.re_init_workspace();
    helper.populate_components(2, true, "");
    let remote = helper.scopes.remote.clone();
    let comp2_pkg = format!("@{remote}/comp2");
    helper.run(&format!("deps set comp1 {comp2_pkg}@+ --peer"));
    helper.native("snap --skip-tests");

    let show = parse(&helper.show_component_parsed(&format!("{remote}/comp1")));
    let peer_dep = &show["peerDependencies"][0];
    assert!(
        peer_dep["id"]
            .as_str()
            .unwrap()
            .starts_with(&format!("{remote}/comp2")),
    );
    assert_eq!(peer_dep["packageName"].as_str(), Some(comp2_pkg.as_str()));
    assert!(
        peer_dep["versionRange"]
            .as_str()
            .unwrap()
            .starts_with('+'),
    );

    let comp = parse(&helper.native("cat-component comp1@latest --json"));
    let dep_res = comp["extensions"]
        .as_array()
        .unwrap()
        .iter()
        .find(|ext| ext["name"].as_str() == Some("teambit.dependencies/dependency-resolver"))
        .unwrap();
    let dep0 = &dep_res["data"]["dependencies"][0];
    assert_eq!(dep0["packageName"].as_str(), Some(comp2_pkg.as_str()));
    assert_eq!(dep0["lifecycle"].as_str(), Some("peer"));
    assert_eq!(dep0["versionRange"].as_str(), Some("+"));
}
