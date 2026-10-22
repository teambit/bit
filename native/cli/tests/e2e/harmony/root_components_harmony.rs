mod known_failures {
    use crate::{
        allow_known_failure,
        helper::{Helper, config},
    };
    use serde_json::{Value, json};
    use std::{fs, path::Path};

    fn configure_root_components(helper: &Helper, pm: &str, extra: &Value) {
        let mut policy = json!({
            "packageManager": format!("teambit.dependencies/{pm}"),
            "rootComponents": true,
        });
        if let (Some(dst), Some(src)) = (policy.as_object_mut(), extra.as_object()) {
            for (k, v) in src {
                dst.insert(k.clone(), v.clone());
            }
        }
        config::set_workspace_key(
            &helper.scopes.local_path,
            "teambit.dependencies/dependency-resolver",
            policy,
        );
    }

    fn setup_bar_and_precision_range(helper: &Helper, pm: &str) {
        helper.set_workspace_with_remote_scope();
        configure_root_components(
            helper,
            pm,
            &json!({ "policy": { "dependencies": { "is-positive": "1.0.0", "is-odd": "1.0.0" } } }),
        );
        helper.output_file(
            "bar/app.js",
            "const isPositive = require('is-positive');\nconsole.log(isPositive(1));\n",
        );
        helper.output_file(
            "bar/app.spec.js",
            "it('should pass', () => {\n  expect(true).toBe(true);\n});\n",
        );
        helper.run("add bar");
        let scope = helper.scopes.remote.clone();
        helper.output_file(
            "precision-range/precision-range.js",
            &format!("const bar = require('@{scope}/bar');\nconst isOdd = require('is-odd');\n"),
        );
        helper.run("add precision-range");
        helper.run("eject-conf precision-range");
        let mut comp_json = helper.read_component_json("precision-range");
        comp_json["defaultScope"] = json!(scope);
        helper.write_component_json("precision-range", &comp_json);
        helper.set_component_json_extension(
            "precision-range",
            "teambit.dependencies/dependency-resolver",
            json!({ "policy": { "peerDependencies": { "is-odd": "^1.0.0" } } }),
        );
    }

    fn assert_node_module_version(base: &Path, pkg: &str, expected: &str) {
        let pkg_json = base
            .join("node_modules")
            .join(pkg)
            .join("package.json");
        let content = fs::read_to_string(&pkg_json).expect("read package.json");
        let parsed: Value = serde_json::from_str(&content).expect("parse package.json");
        assert_eq!(parsed["version"].as_str(), Some(expected));
    }

    #[test]
    fn pnpm_root_components_install_and_link() {
        let helper = Helper::new();
        allow_known_failure!(helper.native_output_or_known("install"));
        setup_bar_and_precision_range(&helper, "pnpm");
        allow_known_failure!(helper.native_output_or_known("install"));
        allow_known_failure!(helper.native_output_or_known("compile"));
        let check_out = allow_known_failure!(helper.native_output_or_known("check-types"));
        assert!(check_out.contains("found 0 errors"));
        let test_out = allow_known_failure!(helper.native_output_or_known("test"));
        assert!(test_out.contains("passed"));
        let ws = &helper.scopes.local_path;
        let scope = &helper.scopes.remote;
        assert!(
            ws.join(format!("node_modules/@{scope}/precision-range/package.json"))
                .exists(),
        );
        assert!(ws.join("bar/node_modules/is-positive").exists());
        assert!(
            ws.join(format!("precision-range/node_modules/@{scope}/bar/app.js"))
                .exists(),
        );
        assert!(ws.join("precision-range/node_modules/is-odd").exists());
    }

    #[test]
    fn pnpm_hoisting_and_capsuling() {
        let helper = Helper::new();
        allow_known_failure!(helper.native_output_or_known("install"));
        setup_bar_and_precision_range(&helper, "pnpm");
        helper.add_key_val_to_dependency_resolver_policy("is-Positive", "1.0.0");
        allow_known_failure!(helper.native_output_or_known("install"));
        let ws = &helper.scopes.local_path;
        assert_node_module_version(&ws.join("bar"), "is-positive", "1.0.0");
        let cap_out = allow_known_failure!(helper.native_output_or_known("capsule create"));
        assert!(!cap_out.is_empty());
    }

    #[test]
    fn pnpm_root_peers_from_depth_2() {
        let helper = Helper::new();
        allow_known_failure!(helper.native_output_or_known("install"));
        setup_bar_and_precision_range(&helper, "pnpm");
        helper.output_file(
            "comp1/index.js",
            &format!("const pr = require('@{}/precision-range');\n", helper.scopes.remote),
        );
        helper.run("add comp1");
        allow_known_failure!(helper.native_output_or_known("install"));
        assert!(helper.scopes.local_path.join("node_modules/is-odd").exists());
    }

    #[test]
    fn pnpm_linking_root_components_and_compile() {
        let helper = Helper::new();
        allow_known_failure!(helper.native_output_or_known("install"));
        setup_bar_and_precision_range(&helper, "pnpm");
        allow_known_failure!(helper.native_output_or_known("install"));
        let linked = helper.scopes.local_path.join(format!(
            "precision-range/node_modules/@{}/bar/app.js",
            helper.scopes.remote,
        ));
        assert!(linked.exists());
        helper.output_file("bar/new-file.js", "console.log('hello');\n");
        allow_known_failure!(helper.native_output_or_known("compile"));
        assert!(
            helper.scopes.local_path
                .join(format!(
                    "precision-range/node_modules/@{}/bar/new-file.js",
                    helper.scopes.remote,
                ))
                .exists(),
        );
    }

    #[test]
    fn pnpm_cached_peers_and_subdep_peers() {
        let helper = Helper::new();
        allow_known_failure!(helper.native_output_or_known("install"));
        setup_bar_and_precision_range(&helper, "pnpm");
        allow_known_failure!(helper.native_output_or_known("install"));
        helper.delete_path("node_modules");
        helper.delete_path("precision-range/node_modules");
        allow_known_failure!(helper.native_output_or_known("install"));
        assert!(helper.scopes.local_path.join("precision-range/node_modules/is-odd").exists());
        assert!(helper.scopes.local_path.join("bar/node_modules/is-positive").exists());
    }

    #[test]
    fn pnpm_transitive_peers_and_tag() {
        let helper = Helper::new();
        allow_known_failure!(helper.native_output_or_known("install"));
        setup_bar_and_precision_range(&helper, "pnpm");
        allow_known_failure!(helper.native_output_or_known("install"));
        allow_known_failure!(helper.native_output_or_known("tag --build"));
        helper.export("");
        let scope = helper.scopes.remote.clone();
        helper.re_init_workspace();
        helper.add_remote_scope();
        configure_root_components(&helper, "pnpm", &json!({}));
        allow_known_failure!(helper.native_output_or_known(&format!(
            "import {scope}/precision-range"
        )));
        assert!(helper.scopes.local_path.join("precision-range/node_modules/is-odd").exists());
    }

    #[test]
    fn pnpm_runtime_dep_isolation() {
        let helper = Helper::new();
        allow_known_failure!(helper.native_output_or_known("install"));
        setup_bar_and_precision_range(&helper, "pnpm");
        allow_known_failure!(helper.native_output_or_known("install"));
        let missing = helper.scopes.local_path.join("precision-range/node_modules/is-positive");
        assert!(!missing.exists());
        helper.output_file(
            "precision-range/precision-range.js",
            "const isPositive = require('is-positive');\n",
        );
        allow_known_failure!(helper.native_output_or_known("install"));
        assert!(missing.exists());
    }

    #[test]
    fn yarn_root_components_install_and_link() {
        let helper = Helper::new();
        allow_known_failure!(helper.native_output_or_known("install"));
        setup_bar_and_precision_range(&helper, "yarn");
        allow_known_failure!(helper.native_output_or_known("install"));
        allow_known_failure!(helper.native_output_or_known("compile"));
        let ws = &helper.scopes.local_path;
        let scope = &helper.scopes.remote;
        assert!(ws.join("bar/node_modules/is-positive").exists());
        assert!(
            ws.join(format!("precision-range/node_modules/@{scope}/bar/app.js"))
                .exists(),
        );
    }

    #[test]
    fn yarn_hoisting_and_capsuling() {
        let helper = Helper::new();
        allow_known_failure!(helper.native_output_or_known("install"));
        setup_bar_and_precision_range(&helper, "yarn");
        allow_known_failure!(helper.native_output_or_known("install"));
        let ws = &helper.scopes.local_path;
        assert_node_module_version(&ws.join("bar"), "is-positive", "1.0.0");
        let cap_out = allow_known_failure!(helper.native_output_or_known("capsule create"));
        assert!(!cap_out.is_empty());
    }

    #[test]
    fn yarn_root_peers_from_depth_2() {
        let helper = Helper::new();
        allow_known_failure!(helper.native_output_or_known("install"));
        setup_bar_and_precision_range(&helper, "yarn");
        helper.output_file(
            "comp1/index.js",
            &format!("const pr = require('@{}/precision-range');\n", helper.scopes.remote),
        );
        helper.run("add comp1");
        allow_known_failure!(helper.native_output_or_known("install"));
        assert!(helper.scopes.local_path.join("node_modules/is-odd").exists());
    }

    #[test]
    fn yarn_linking_and_peers() {
        let helper = Helper::new();
        allow_known_failure!(helper.native_output_or_known("install"));
        setup_bar_and_precision_range(&helper, "yarn");
        allow_known_failure!(helper.native_output_or_known("install"));
        helper.output_file("bar/new-file.js", "console.log('hello');\n");
        allow_known_failure!(helper.native_output_or_known("compile"));
        let ws = &helper.scopes.local_path;
        let scope = &helper.scopes.remote;
        assert!(
            ws.join(format!("precision-range/node_modules/@{scope}/bar/new-file.js"))
                .exists(),
        );
        assert!(ws.join("precision-range/node_modules/is-odd").exists());
        assert!(ws.join("bar/node_modules/is-positive").exists());
    }

    #[test]
    fn yarn_transitive_peers_and_tag() {
        let helper = Helper::new();
        allow_known_failure!(helper.native_output_or_known("install"));
        setup_bar_and_precision_range(&helper, "yarn");
        allow_known_failure!(helper.native_output_or_known("install"));
        allow_known_failure!(helper.native_output_or_known("tag --build"));
        helper.export("");
        let scope = helper.scopes.remote.clone();
        helper.re_init_workspace();
        helper.add_remote_scope();
        configure_root_components(&helper, "yarn", &json!({}));
        allow_known_failure!(helper.native_output_or_known(&format!(
            "import {scope}/precision-range"
        )));
        assert!(helper.scopes.local_path.join("precision-range/node_modules/is-odd").exists());
    }

    #[test]
    fn yarn_runtime_dep_isolation() {
        let helper = Helper::new();
        allow_known_failure!(helper.native_output_or_known("install"));
        setup_bar_and_precision_range(&helper, "yarn");
        allow_known_failure!(helper.native_output_or_known("install"));
        let missing = helper.scopes.local_path.join("precision-range/node_modules/is-positive");
        assert!(!missing.exists());
        helper.output_file(
            "precision-range/precision-range.js",
            "const isPositive = require('is-positive');\n",
        );
        allow_known_failure!(helper.native_output_or_known("install"));
        assert!(missing.exists());
    }

    #[test]
    fn aspect_peer_dependency_in_root() {
        let helper = Helper::new();
        allow_known_failure!(helper.native_output_or_known("install"));
        helper.set_workspace_with_remote_scope();
        configure_root_components(
            &helper,
            "yarn",
            &json!({
                "policy": {
                    "dependencies": { "is-positive": "1.0.0" }
                }
            }),
        );
        helper.create_aspect("my-aspect");
        allow_known_failure!(helper.native_output_or_known("install"));
        assert!(helper.scopes.local_path.join("node_modules/is-positive").exists());
        configure_root_components(
            &helper,
            "pnpm",
            &json!({
                "policy": {
                    "dependencies": { "is-positive": "1.0.0" }
                }
            }),
        );
        allow_known_failure!(helper.native_output_or_known("install"));
        assert!(helper.scopes.local_path.join("node_modules/is-positive").exists());
    }

    #[test]
    fn aspect_in_workspace_with_root_components() {
        let helper = Helper::new();
        allow_known_failure!(helper.native_output_or_known("install"));
        helper.set_workspace_with_remote_scope();
        configure_root_components(&helper, "pnpm", &json!({}));
        helper.create_aspect("my-aspect");
        allow_known_failure!(helper.native_output_or_known("install"));
        let status = allow_known_failure!(helper.status_json_or_known());
        assert!(status["newComponents"].as_array().is_some());
    }

    #[test]
    fn deleting_a_component_removes_from_root_and_dependent() {
        let helper = Helper::new();
        allow_known_failure!(helper.native_output_or_known("install"));
        setup_bar_and_precision_range(&helper, "pnpm");
        allow_known_failure!(helper.native_output_or_known("install"));
        helper.output_file(
            "precision-range/precision-range.js",
            "const isOdd = require('is-odd');\n",
        );
        allow_known_failure!(helper.native_output_or_known("remove bar --silent"));
        let ws = &helper.scopes.local_path;
        let scope = &helper.scopes.remote;
        assert!(
            !ws.join(format!("precision-range/node_modules/@{scope}/bar"))
                .exists(),
        );
        assert!(
            !ws.join(format!("node_modules/@{scope}/bar"))
                .exists(),
        );
    }

    #[test]
    fn adding_new_peer_dependency_and_removing_component() {
        let helper = Helper::new();
        allow_known_failure!(helper.native_output_or_known("install"));
        setup_bar_and_precision_range(&helper, "pnpm");
        allow_known_failure!(helper.native_output_or_known("install"));
        helper.run("eject-conf bar");
        helper.set_component_json_extension(
            "bar",
            "teambit.dependencies/dependency-resolver",
            json!({
                "policy": {
                    "peerDependencies": {
                        "is-positive": "^1.0.0"
                    }
                }
            }),
        );
        allow_known_failure!(helper.native_output_or_known("install"));
        let show = helper.show_component_parsed_harmony("bar");
        assert!(show.is_array());
        helper.output_file(
            "precision-range/precision-range.js",
            "const isOdd = require('is-odd');\n",
        );
        allow_known_failure!(helper.native_output_or_known("remove bar --silent"));
        let ws = &helper.scopes.local_path;
        let scope = &helper.scopes.remote;
        assert!(
            !ws.join(format!("node_modules/@{scope}/bar"))
                .exists(),
        );
    }
}
