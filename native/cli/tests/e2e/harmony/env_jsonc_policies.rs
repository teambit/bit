//! `e2e/harmony/dependencies/env-jsonc-policies.e2e.ts`.

use crate::{
    helper::{Helper, parse},
    known_failure::KnownResult,
};
use serde_json::json;

#[test]
fn env_jsonc_policies_peers_devs_runtime_and_extends() -> KnownResult<()> {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    let env_id = helper.set_custom_env("node-env");
    let full_env_id = format!("{}/{env_id}", helper.scopes.remote);

    helper.output_file(
        "node-env/env.jsonc",
        r#"{
            "policy": {
                "peers": [
                    {
                        "name": "react",
                        "version": "^18.0.0",
                        "supportedRange": "^17.0.0 || ^18.0.0"
                    }
                ],
                "dev": [
                    {
                        "name": "@types/react",
                        "version": "18.0.0",
                        "hidden": true,
                        "force": true
                    }
                ],
                "runtime": [
                    {
                        "name": "is-positive",
                        "version": "1.0.0",
                        "force": true
                    }
                ]
            },
            "patterns": {
                "compositions": ["**/*.composition.*"],
                "docs": ["**/*.docs.*"],
                "tests": ["**/*.spec.*"]
            }
        }"#,
    );
    helper.npm_add_fake_package("react", "18.0.0", false);
    helper.npm_add_fake_package("@types/react", "18.0.0", false);
    helper.npm_add_fake_package("is-positive", "1.0.0", false);

    helper.output_file("comp1/index.js", "const react = require('react');\n");
    helper.run("add comp1");
    helper.run(&format!("env set comp1 {full_env_id}"));

    let conf = helper.show_aspect_config("comp1", "teambit.dependencies/dependency-resolver");
    let deps = conf["data"]["dependencies"].as_array().unwrap();
    assert!(
        deps.iter()
            .any(|dep| dep["id"].as_str() == Some("is-positive")),
        "{deps:?}",
    );
    assert!(
        deps.iter()
            .any(|dep| dep["id"].as_str() == Some("react")
                && dep["lifecycle"].as_str() == Some("peer")),
        "{deps:?}",
    );

    // tag and verify model stores resolved env manifest and dependencies
    helper.compile();
    helper.tag_all_without_build(r#"--ignore-issues "*""#);
    let ver = parse(&helper.cat_component("comp1@0.0.1"));
    assert_eq!(ver["packageDependencies"]["is-positive"].as_str(), Some("1.0.0"), "{ver}");
    assert_eq!(
        ver["peerPackageDependencies"]["react"].as_str(),
        Some("^17.0.0 || ^18.0.0"),
        "{ver}",
    );
    let _ = json!({});
    Ok(())
}
