use crate::helper::{Helper, config};
use serde_json::Value;
use std::path::Path;

#[test]
fn root_snap_no_deps_and_cloning_workspace_from_root_and_lane() {
    let helper = Helper::new();
    let globals = helper.own_global_config("analytics_reporting", "false");

    // when a root file has a relative import into a component and requires a missing package -> should snap with no dependencies
    helper.re_init_workspace();
    helper.output_file("comp1/index.js", "module.exports = () => \"comp1\";\n");
    helper.add_component("comp1", "-i comp1");
    helper.output_file("README.md", "# workspace root\n");
    helper.add_component(".", "-i ws-root --root");
    helper.output_file(
        "app.js",
        "require('./comp1');\nrequire('some-package-that-is-not-installed');\n",
    );
    helper.snap_component_without_build("ws-root", "");
    let version_object = helper.cat_component_parsed("ws-root@latest");
    assert_eq!(version_object["dependencies"].as_array().map(Vec::len), Some(0));
    assert_eq!(
        version_object["packageDependencies"].as_object().map(serde_json::Map::len),
        Some(0),
    );

    // trackAllFiles: tracking the files bit treats as generated -> cloning the workspace from its root component
    helper.set_workspace_with_remote_scope();
    helper.add_key_val_to_workspace("trackAllFiles", Value::Bool(true));
    helper.output_file("comp1/index.js", "module.exports = () => \"comp1\";\n");
    helper.output_file("comp1/package.json", "{ \"name\": \"comp1\", \"version\": \"0.0.1\" }\n");
    helper.output_file("comp1/tsconfig.json", "{}\n");
    helper.add_component("comp1", "-i comp1");
    helper.output_file("package.json", "{ \"name\": \"monorepo\", \"private\": true }\n");
    helper.output_file("README.md", "# workspace root\n");
    helper.add_component(".", "-i ws-root --root");

    helper.snap_all_components_without_build(r#"--ignore-issues "*""#);
    helper.export("");
    helper.clean_workspace();
    run_isolated(
        helper.local_path(),
        &globals,
        &format!("remote add file://{} --global", helper.remote_path().display()),
        true,
    );
    let output = run_isolated(
        helper.local_path(),
        &globals,
        &format!("clone {}/ws-root . -x", helper.remote_scope()),
        true,
    );

    assert!(output.contains(&format!("cloned {}/ws-root@", helper.remote_scope())));
    assert!(output.contains("with 1 component"));
    assert_eq!(helper.read_file("package.json"), "{ \"name\": \"monorepo\", \"private\": true }\n");
    assert_eq!(helper.read_file("README.md"), "# workspace root\n");
    assert_eq!(
        helper.read_workspace_jsonc()["teambit.workspace/workspace"]["trackAllFiles"].as_bool(),
        Some(true),
    );
    let bitmap = helper.read_bit_map();
    assert_eq!(bitmap["comp1"]["rootDir"].as_str(), Some("comp1"));
    assert!(
        helper
            .local_path()
            .join("comp1/package.json")
            .exists(),
    );
    assert!(
        helper
            .local_path()
            .join("comp1/tsconfig.json")
            .exists(),
    );

    let status = helper.status_json();
    assert_eq!(status["modifiedComponents"].as_array().map(Vec::len), Some(0));
    assert_eq!(status["newComponents"].as_array().map(Vec::len), Some(0));

    let not_a_root_path = helper.e2e_dir().join("not-a-root");
    let err = run_isolated(
        helper.e2e_dir(),
        &globals,
        &format!("clone {}/comp1 {} -x", helper.remote_scope(), not_a_root_path.display()),
        false,
    );
    assert!(err.contains("not a workspace-root component"));
    assert!(!not_a_root_path.exists());

    let never_exported_path = helper.e2e_dir().join("never-exported");
    let err = run_isolated(
        helper.e2e_dir(),
        &globals,
        &format!(
            "clone {}/never-exported {} -x",
            helper.remote_scope(),
            never_exported_path.display(),
        ),
        false,
    );
    assert!(err.contains(&format!(
        r#"the remote scope "{}" does not have"#,
        helper.remote_scope()
    )));
    assert!(!never_exported_path.exists());
    let _ = run_isolated(
        helper.local_path(),
        &globals,
        &format!("remote del {} --global", helper.remote_scope()),
        true,
    );

    // cloning a workspace as it is on a lane
    helper.set_workspace_with_remote_scope();
    helper.output_file("comp1/index.js", "module.exports = () => \"comp1\";\n");
    helper.output_file("comp2/index.js", "module.exports = () => \"comp2\";\n");
    helper.output_file("README.md", "# on main\n");
    helper.add_component("comp1", "-i comp1");
    helper.add_component("comp2", "-i comp2");
    helper.add_component(".", "-i ws-root --root");
    helper.snap_all_components_without_build(r#"--ignore-issues "*""#);
    helper.export("");
    let comp1_main_head = helper.get_head("comp1");
    let comp2_main_head = helper.get_head("comp2");
    helper.create_lane("dev", "");
    helper.output_file("comp1/index.js", "module.exports = () => \"comp1 v2\";\n");
    helper.output_file("README.md", "# on the lane\n");
    helper.snap_all_components_without_build(r#"--ignore-issues "*""#);
    helper.export("");
    let comp1_lane_head = helper.head_of_lane("dev", "comp1");
    let root_lane_head = helper.head_of_lane("dev", "ws-root");
    helper.switch_local_lane("main", "");
    helper.output_file("README.md", "# on main again\n");
    helper.snap_all_components_without_build(r#"--ignore-issues "*""#);
    helper.export("");
    let root_main_head = helper.get_head("ws-root");
    helper.clean_workspace();
    run_isolated(
        helper.local_path(),
        &globals,
        &format!("remote add file://{} --global", helper.remote_path().display()),
        true,
    );
    run_isolated(
        helper.local_path(),
        &globals,
        &format!(
            "clone {}/ws-root . --lane {}/dev -x",
            helper.remote_scope(),
            helper.remote_scope(),
        ),
        true,
    );

    let bitmap = helper.read_bit_map();
    assert_eq!(bitmap["_bit_lane"]["id"]["name"].as_str(), Some("dev"));
    assert_eq!(bitmap["_bit_lane"]["id"]["scope"].as_str(), Some(helper.remote_scope()));
    assert_ne!(comp1_lane_head, comp1_main_head);
    assert_eq!(bitmap["comp1"]["version"].as_str(), Some(comp1_lane_head.as_str()));
    assert_eq!(bitmap["ws-root"]["version"].as_str(), Some(root_lane_head.as_str()));
    assert_eq!(bitmap["comp2"]["version"].as_str(), Some(comp2_main_head.as_str()));
    helper.expect_status_to_be_clean();

    // with a version on the root id, which pins the root files only
    let clone_path = helper.e2e_dir().join("pinned-root-clone");
    std::fs::create_dir_all(&clone_path).expect("create clone_path");
    run_isolated(
        helper.e2e_dir(),
        &globals,
        &format!(
            "clone {}/ws-root@{root_main_head} {} --lane {}/dev -x",
            helper.remote_scope(),
            clone_path.display(),
            helper.remote_scope(),
        ),
        true,
    );
    assert_ne!(root_main_head, root_lane_head);
    let clone_bitmap: Value = config::read_jsonc(&clone_path.join(".bitmap"));
    assert_eq!(clone_bitmap["ws-root"]["version"].as_str(), Some(root_main_head.as_str()));
    assert_eq!(
        std::fs::read_to_string(clone_path.join("README.md")).expect("README.md"),
        "# on main again\n",
    );
    assert_eq!(clone_bitmap["comp1"]["version"].as_str(), Some(comp1_lane_head.as_str()));
    assert_eq!(clone_bitmap["comp2"]["version"].as_str(), Some(comp2_main_head.as_str()));
    assert_eq!(clone_bitmap["_bit_lane"]["id"]["name"].as_str(), Some("dev"));
    assert_eq!(clone_bitmap["_bit_lane"]["id"]["scope"].as_str(), Some(helper.remote_scope()));

    let _ = run_isolated(
        helper.local_path(),
        &globals,
        &format!("remote del {} --global", helper.remote_scope()),
        true,
    );
}

fn run_isolated(cwd: &Path, globals: &Path, command: &str, success: bool) -> String {
    let run = Helper::cmd_in_with(cwd, command, &[("BIT_GLOBALS_DIR", globals.as_os_str())]);
    assert_eq!(run.status.success(), success, "{command}: {run:?}");
    format!("{}\n{}", run.stdout, run.stderr)
}
