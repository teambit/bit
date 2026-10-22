//! Cases from:
//! - `e2e/harmony/build-cmd.e2e.ts`
//! - `e2e/harmony/babel.e2e.ts`
//! - `e2e/harmony/multiple-compilers.e2e.ts`

use crate::{
    allow_known_failure,
    helper::{Helper, parse},
    known_failure::KnownResult,
};
use serde_json::{Value, json};
use std::{fs, path::PathBuf};

fn setup_custom_new_env(helper: &Helper, folder: &str) -> KnownResult<String> {
    helper.copy_fixture_extensions(folder);
    helper.native(&format!("add {folder}"));
    helper.add_extension_to_variant(folder, "teambit.envs/env", json!({}));
    helper.run("link");
    helper.native_output_or_known("install")?;
    helper.native_output_or_known("compile")?;
    Ok(format!("{}/{folder}", helper.scopes.remote))
}

fn setup_build_outside_pipelines(helper: &Helper, should_fail: bool) -> KnownResult<()> {
    helper.set_workspace_with_remote_scope();
    let folder = "node-env";
    helper.copy_fixture_extensions(folder);
    if should_fail {
        helper.output_file(&format!("{folder}/fail.js"), "throw new Error('failed');");
    }
    let env_id = setup_custom_new_env(helper, folder)?;
    helper.populate_components(3, true, "");
    helper.add_extension_to_variant("*", &env_id, json!({}));
    helper.native_output_or_known("compile")?;
    Ok(())
}

fn setup_babel_with_ts_harmony(helper: &Helper) -> KnownResult<String> {
    let folder = "multiple-compilers-env";
    helper.copy_fixture_extensions(folder);
    helper.native(&format!("add {folder}"));
    helper.add_extension_to_variant(folder, "teambit.harmony/aspect", json!({}));
    helper.run("link");
    helper.add_extension_to_variant(
        folder,
        "teambit.dependencies/dependency-resolver",
        json!({
            "policy": {
                "dependencies": {
                    "@babel/runtime": "^7.8.4",
                    "@babel/core": "7.11.6",
                    "@babel/preset-env": "7.22.15",
                    "@babel/preset-typescript": "7.22.15",
                    "@babel/plugin-proposal-class-properties": "7.8.3"
                }
            }
        }),
    );
    helper.native_output_or_known("install")?;
    helper.native_output_or_known("compile")?;
    Ok(folder.to_owned())
}

fn setup_babel_workspace(helper: &Helper) -> KnownResult<PathBuf> {
    helper.set_workspace_with_remote_scope();
    let folder = "babel-env";
    helper.copy_fixture_extensions(folder);
    helper.native(&format!("add {folder}"));
    helper.add_extension_to_variant(folder, "teambit.harmony/aspect", json!({}));
    helper.run("link");
    helper.add_extension_to_variant(
        folder,
        "teambit.dependencies/dependency-resolver",
        json!({
            "policy": {
                "dependencies": {
                    "@babel/runtime": "^7.12.0",
                    "@babel/core": "7.11.6",
                    "@babel/preset-env": "7.22.15"
                }
            }
        }),
    );
    helper.native_output_or_known("install")?;
    helper.native_output_or_known("compile")?;
    helper.output_file(
        "bar/foo.js",
        r#"export function sayHello() { console.log("hello"); }; sayHello();"#,
    );
    helper.native("add bar");
    helper.add_extension_to_variant(
        "bar",
        &format!("{}/{folder}", helper.scopes.remote),
        json!({}),
    );
    helper.native_output_or_known("compile")?;
    Ok(helper.scopes.local_path.join(format!("node_modules/@{}/bar/dist", helper.scopes.remote)))
}

fn setup_multi_compiler_simple(helper: &Helper) -> KnownResult<PathBuf> {
    helper.set_workspace_with_remote_scope();
    let env_name = setup_babel_with_ts_harmony(helper)?;
    helper.output_file(
        "bar/foo.ts",
        r#"export function sayHello(name: string) { console.log(`hello ${name}`); }; sayHello("David");"#,
    );
    helper.native("add bar");
    helper.add_extension_to_variant(
        "bar",
        &format!("{}/{env_name}", helper.scopes.remote),
        json!({}),
    );
    helper.native_output_or_known("compile")?;
    Ok(helper.scopes.local_path.join(format!("node_modules/@{}/bar/dist", helper.scopes.remote)))
}

fn setup_multi_compiler_graph(helper: &Helper) -> KnownResult<String> {
    helper.set_workspace_with_remote_scope();
    let prefix = format!("@{}/", helper.scopes.remote);
    for idx in 1..=4 {
        let next_idx = idx + 1;
        let content = if idx == 4 {
            format!("export default () => 'comp{idx}';")
        } else {
            format!(
                "import comp{next_idx} from '{prefix}comp{next_idx}';\nexport default () => 'comp{idx} and ' + comp{next_idx}();",
            )
        };
        helper.output_file(&format!("comp{idx}/index.ts"), &content);
        helper.native(&format!("add comp{idx}"));
    }
    helper.run("link");
    let babel_env = setup_babel_with_ts_harmony(helper)?;
    let env_id = format!("{}/{babel_env}", helper.scopes.remote);
    helper.add_extension_to_variant("comp1", &env_id, json!({}));
    helper.add_extension_to_variant("comp2", "teambit.harmony/node", json!({}));
    helper.add_extension_to_variant("comp3", &env_id, json!({}));
    helper.add_extension_to_variant("comp4", "teambit.harmony/node", json!({}));
    helper.native_output_or_known("compile")?;
    helper.native_output_or_known("build")
}

fn setup_loose_build_workspace(helper: &Helper) -> KnownResult<()> {
    helper.set_workspace_with_remote_scope();
    helper.output_file("comp1/index.js", "module.exports = () => 'comp1';");
    helper.output_file(
        "comp1/index.spec.js",
        "describe('test', () => {\n  it('should pass', () => {\n    expect(true).toBe(true);\n  });\n  it('should fail', () => {\n    expect(true).toBe(false);\n  });\n});\n",
    );
    helper.native("add comp1");
    helper.run("link --rewire");
    helper.native_output_or_known("compile")?;
    Ok(())
}

mod known_failures {
    use super::{
        Helper, Value, allow_known_failure, fs, json, parse, setup_babel_workspace,
        setup_build_outside_pipelines, setup_custom_new_env, setup_loose_build_workspace,
        setup_multi_compiler_graph, setup_multi_compiler_simple,
    };

    #[test]
    fn build_cmd_list_tasks() {
        let helper = Helper::new();
        helper.re_init_workspace();
        let output = allow_known_failure!(helper.native_output_or_known("build --list-tasks"));
        let lines: Vec<&str> = output.lines().collect();
        let tag_index = lines
            .iter()
            .position(|line| line.contains("TagPipeline"))
            .unwrap_or(0);
        let snap_index = lines
            .iter()
            .position(|line| line.contains("SnapPipeline"))
            .unwrap_or(0);
        assert!(
            lines[..tag_index]
                .iter()
                .any(|line| line.contains("teambit.pkg/pkg:PublishComponents")),
        );
        assert!(
            lines[tag_index..snap_index]
                .iter()
                .any(|line| line.contains("teambit.pkg/pkg:PublishComponents")),
        );
        assert!(
            lines[snap_index..]
                .iter()
                .any(|line| line.contains("teambit.pkg/pkg:PublishComponents")),
        );
    }

    #[test]
    fn build_cmd_symmetric_cycle() {
        let helper = Helper::new();
        helper.set_workspace_with_remote_scope();
        let scope = &helper.scopes.remote;
        helper.output_file("comp1/index.js", &format!("require('@{scope}/comp2');"));
        helper.output_file("comp2/index.js", &format!("require('@{scope}/comp1');"));
        helper.native("add comp1");
        helper.native("add comp2");
        helper.run("link --rewire");
        let output = allow_known_failure!(helper.native_output_or_known("build"));
        assert!(output.contains("build succeeded"));
    }

    #[test]
    fn build_cmd_two_envs_execution_contexts() {
        let helper = Helper::new();
        helper.set_workspace_with_remote_scope();
        helper.output_file("comp1/index.js", "module.exports = () => 'comp1';");
        helper.output_file("comp2/index.js", "module.exports = () => 'comp2';");
        helper.native("add comp1");
        helper.native("add comp2");
        let env_id = allow_known_failure!(setup_custom_new_env(&helper, "node-env"));
        helper.add_extension_to_variant("comp1", &env_id, json!({}));
        let output = allow_known_failure!(helper.native_output_or_known("build"));
        assert!(output.contains("build succeeded"));
        assert!(output.contains("total 2 components"));
    }

    #[test]
    fn build_cmd_default_builder_config() {
        let helper = Helper::new();
        helper.set_workspace_with_remote_scope();
        helper.output_file("comp1/index.js", "module.exports = () => 'comp1';");
        helper.native("add comp1");
        let _ = allow_known_failure!(helper.native_output_or_known("compile"));
        let builder = helper.show_aspect_config("comp1", "teambit.pipelines/builder");
        assert_eq!(builder["config"], json!({}));
    }

    #[test]
    fn build_cmd_outside_pipelines_graph() {
        let helper = Helper::new();
        allow_known_failure!(setup_build_outside_pipelines(&helper, false));
        let output = allow_known_failure!(helper.native_output_or_known("build comp2"));
        assert!(output.contains("** build-graph-ids: comp2, comp3 **"));
    }

    #[test]
    fn build_cmd_outside_pipelines_non_zero_exit() {
        let helper = Helper::new();
        allow_known_failure!(setup_build_outside_pipelines(&helper, true));
        let run = helper.cmd("build comp2");
        assert!(!run.status.success());
    }

    #[test]
    fn build_cmd_inside_pipelines_graph() {
        let helper = Helper::new();
        allow_known_failure!(setup_build_outside_pipelines(&helper, false));
        helper.tag_all_without_build("");
        let output = helper.tag_without_build("comp2", "--unmodified --build");
        assert!(output.contains("** tag-graph-ids: comp3, comp2@0.0.2, comp1@0.0.2 **"));
    }

    #[test]
    fn build_cmd_multi_env_task_dependencies() {
        let helper = Helper::new();
        helper.set_workspace_with_remote_scope();
        helper.copy_fixture_extensions("node-env-1");
        helper.copy_fixture_extensions("node-env-2");
        helper.native("add node-env-1 -i env-one");
        helper.native("add node-env-2 -i env-two");
        let _ = allow_known_failure!(helper.native_output_or_known("compile"));
        helper.output_file("comp1/index.js", "module.exports = () => 'comp1';");
        helper.output_file("comp2/index.js", "module.exports = () => 'comp2';");
        helper.native("add comp1");
        helper.native("add comp2");
        helper.add_extension_to_variant(
            "comp1",
            &format!("{}/env-one", helper.scopes.remote),
            json!({}),
        );
        helper.add_extension_to_variant(
            "comp2",
            &format!("{}/env-two", helper.scopes.remote),
            json!({}),
        );
        helper.run("compile");
        let output = helper.run("build");
        let lines: Vec<&str> = output
            .lines()
            .filter(|line| line.contains("=== MultiEnvTest ==="))
            .collect();
        let dep_idx = lines
            .iter()
            .position(|line| line.contains("DependentTask"))
            .unwrap_or(0);
        assert!(
            lines[..dep_idx]
                .iter()
                .any(|line| line.contains("DependencyTask") && line.contains("env-one")),
        );
        assert!(
            lines[..dep_idx]
                .iter()
                .any(|line| line.contains("DependencyTask") && line.contains("env-two")),
        );
    }

    #[test]
    fn build_cmd_task_metadata_with_link_files() {
        let helper = Helper::new();
        helper.set_workspace_with_remote_scope();
        let env_id = allow_known_failure!(setup_custom_new_env(&helper, "node-env"));
        helper.populate_components(1, true, "");
        helper.add_extension_to_variant("*", &env_id, json!({}));
        helper.compile();
        let output = helper.tag_all_components("");
        assert!(output.contains("1 component(s) tagged"));
    }

    #[cfg(not(windows))]
    #[test]
    fn build_cmd_capsule_readonly_dir_permission() {
        use std::os::unix::fs::PermissionsExt;

        let helper = Helper::new();
        helper.set_workspace_with_remote_scope();
        helper.output_file("comp1/index.js", "module.exports = () => 'comp1';");
        helper.native("add comp1");
        let _ = allow_known_failure!(helper.native_output_or_known("build"));
        let capsule_dir = helper.get_capsule_of_component("comp1");
        fs::set_permissions(&capsule_dir, fs::Permissions::from_mode(0o555)).unwrap();
        let output = helper.run("build --reset");
        assert!(output.contains("build succeeded"));
    }

    #[cfg(windows)]
    #[test]
    fn build_cmd_capsule_readonly_dir_permission() {
        let helper = Helper::new();
        helper.re_init_workspace();
        let _ = allow_known_failure!(helper.native_output_or_known("build"));
    }

    #[test]
    fn build_cmd_loose_flag_fails_by_default() {
        let helper = Helper::new();
        allow_known_failure!(setup_loose_build_workspace(&helper));
        let run = helper.cmd("build");
        assert!(!run.status.success());
    }

    #[test]
    fn build_cmd_loose_flag_succeeds() {
        let helper = Helper::new();
        allow_known_failure!(setup_loose_build_workspace(&helper));
        let output = helper.run("build --loose");
        assert!(output.contains("build succeeded"));
    }

    #[test]
    fn build_cmd_loose_flag_tag_fails_by_default() {
        let helper = Helper::new();
        allow_known_failure!(setup_loose_build_workspace(&helper));
        let run = helper.cmd("tag");
        assert!(!run.status.success());
    }

    #[test]
    fn build_cmd_loose_flag_tag_succeeds() {
        let helper = Helper::new();
        allow_known_failure!(setup_loose_build_workspace(&helper));
        let output = helper.run("tag --loose");
        assert!(output.contains("1 component(s) tagged"));
    }

    #[test]
    fn babel_generate_dists_on_workspace() {
        let helper = Helper::new();
        let dist_dir = allow_known_failure!(setup_babel_workspace(&helper));
        assert!(dist_dir.is_dir());
        assert!(dist_dir.join("foo.js").is_file());
    }

    #[test]
    fn babel_generate_sourcemaps_correctly() {
        let helper = Helper::new();
        let dist_dir = allow_known_failure!(setup_babel_workspace(&helper));
        let map_content = fs::read_to_string(dist_dir.join("foo.js.map")).unwrap();
        let map_parsed: Value = parse(&map_content);
        assert!(
            map_parsed["sourceRoot"]
                .as_str()
                .is_some_and(|root| root.ends_with("bar")),
        );
        assert!(map_parsed.get("sources").is_some());
    }

    #[test]
    fn babel_run_dist_file() {
        let helper = Helper::new();
        let dist_dir = allow_known_failure!(setup_babel_workspace(&helper));
        let foo_js = dist_dir.join("foo.js");
        assert!(foo_js.is_file());
        let result = helper.run_cmd(&format!("node {}", foo_js.display()));
        assert!(result.contains("hello"));
    }

    #[test]
    fn babel_generate_dists_on_capsule() {
        let helper = Helper::new();
        let _ = allow_known_failure!(setup_babel_workspace(&helper));
        helper.run("build");
        let capsule = helper.get_capsule_of_component("bar");
        assert!(capsule.join("dist").is_dir());
        assert!(capsule.join("dist/foo.js").is_file());
    }

    #[test]
    fn multiple_compilers_generate_and_run_dist_on_workspace() {
        let helper = Helper::new();
        let dist_dir = allow_known_failure!(setup_multi_compiler_simple(&helper));
        let foo_js = dist_dir.join("foo.js");
        assert!(foo_js.is_file());
        let result = helper.run_cmd(&format!("node {}", foo_js.display()));
        assert!(result.contains("hello"));
    }

    #[test]
    fn multiple_compilers_save_js_files_under_dist_artifact() {
        let helper = Helper::new();
        let _ = allow_known_failure!(setup_multi_compiler_simple(&helper));
        helper.tag_all_components("");
        let builder = helper.show_aspect_config("bar", "teambit.pipelines/builder");
        let artifacts = builder["data"]["artifacts"].as_array().unwrap();
        let dist = artifacts
            .iter()
            .find(|art| art["name"].as_str() == Some("dist"))
            .unwrap();
        assert_eq!(dist["generatedBy"].as_str(), Some("teambit.compilation/babel"));
    }

    #[test]
    fn multiple_compilers_save_dts_files_under_declaration_artifact() {
        let helper = Helper::new();
        let _ = allow_known_failure!(setup_multi_compiler_simple(&helper));
        helper.tag_all_components("");
        let builder = helper.show_aspect_config("bar", "teambit.pipelines/builder");
        let artifacts = builder["data"]["artifacts"].as_array().unwrap();
        let decl = artifacts
            .iter()
            .find(|art| art["name"].as_str() == Some("declaration"))
            .unwrap();
        assert_eq!(decl["generatedBy"].as_str(), Some("teambit.typescript/typescript"));
    }

    #[test]
    fn multiple_compilers_different_envs_build_succeeds() {
        let helper = Helper::new();
        let build_out = allow_known_failure!(setup_multi_compiler_graph(&helper));
        assert!(build_out.contains("build succeeded"));
    }

    #[test]
    fn multiple_compilers_pre_and_post_build_ran() {
        let helper = Helper::new();
        let build_out = allow_known_failure!(setup_multi_compiler_graph(&helper));
        assert!(build_out.contains("running pre-build for all tasks"));
        assert!(build_out.contains("running post-build for all tasks"));
    }

    #[test]
    fn multiple_compilers_write_npmignore_with_ts_entries() {
        let helper = Helper::new();
        let _ = allow_known_failure!(setup_multi_compiler_graph(&helper));
        let capsule = helper.get_capsule_of_component("comp1");
        assert!(capsule.join(".npmignore").is_file());
    }

    #[test]
    fn multiple_compilers_ts_does_not_override_babel_dist() {
        let helper = Helper::new();
        let _ = allow_known_failure!(setup_multi_compiler_graph(&helper));
        let capsule = helper.get_capsule_of_component("comp3");
        let content = fs::read_to_string(capsule.join("dist/index.js")).unwrap();
        assert!(content.contains("interopRequireDefault"));
        assert!(!content.contains("exports.default"));
    }

    #[test]
    fn multiple_compilers_babel_does_not_override_ts_dist() {
        let helper = Helper::new();
        let _ = allow_known_failure!(setup_multi_compiler_graph(&helper));
        let capsule = helper.get_capsule_of_component("comp2");
        let content = fs::read_to_string(capsule.join("dist/index.js")).unwrap();
        assert!(content.contains("exports.default"));
        assert!(!content.contains("interopRequireDefault"));
    }
}
