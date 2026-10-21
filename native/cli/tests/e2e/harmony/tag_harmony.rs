use crate::helper::{Helper, parse};
use serde_json::Value;

#[path = "tag_harmony/extra.rs"]
mod extra;

#[test]
fn workspace_with_standard_components_and_tag_on_harmony() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(3, true, "");
    helper.tag_all_components("");
    helper.export("");
    helper.re_init_workspace();
    helper.add_remote_scope();
    helper.import_component("*", "");

    // should import successfully with the schema prop
    let comp1 = helper.cat_component_parsed(&format!("{}/comp1@latest", helper.remote_scope()));
    assert_eq!(comp1["schema"].as_str(), Some("2.0.0"));

    // bit status should work and not show modified
    let status = helper.status_json();
    assert_eq!(status["modifiedComponents"].as_array().map(Vec::len), Some(0));

    // tag without build after full tag
    helper.tag_all_without_build("--ver 1.0.0 --unmodified");
    let comp = helper.cat_component_parsed(&format!("{}/comp1@latest", helper.remote_scope()));
    let builder = comp["extensions"]
        .as_array()
        .and_then(|exts| {
            exts.iter()
                .find(|ext| ext["name"].as_str() == Some("teambit.pipelines/builder"))
        })
        .expect("builder extension");
    assert!(builder["data"].get("pipeline").is_none());
    assert!(builder["data"].get("artifacts").is_none());
    helper.export("");

    // tag on Harmony
    helper.set_workspace_with_remote_scope();
    helper.populate_components(3, true, "");
    helper.tag_all_components("");
    helper.export("");
    helper.tag_include_unmodified("0.0.2", "");

    let status = helper.status_json();
    assert_eq!(status["modifiedComponents"].as_array().map(Vec::len), Some(0));

    let show = parse(&helper.show_component_parsed("comp1"));
    assert_eq!(
        show["dependencies"][0]["id"].as_str(),
        Some(format!("{}/comp2@0.0.2", helper.remote_scope()).as_str()),
    );

    let comp1 = helper.cat_component_parsed("comp1@latest");
    let builder = comp1["extensions"]
        .as_array()
        .and_then(|exts| {
            exts.iter()
                .find(|ext| ext["name"].as_str() == Some("teambit.pipelines/builder"))
        })
        .expect("builder extension");
    let pipeline = builder["data"]["pipeline"].as_array().expect("pipeline array");
    let mut task_ids: Vec<String> = pipeline
        .iter()
        .map(|p| {
            format!(
                "{}:{}",
                p["taskId"].as_str().unwrap_or(""),
                p["taskName"].as_str().unwrap_or(""),
            )
        })
        .collect();
    let total_len = task_ids.len();
    task_ids.sort();
    task_ids.dedup();
    assert_eq!(total_len, task_ids.len());

    // auto-tag -> should save the artifacts/dists to the auto-tagged components
    let compiler_artifacts = builder["data"]["artifacts"]
        .as_array()
        .and_then(|arr| {
            arr.iter()
                .find(|art| art["task"]["id"].as_str() == Some("teambit.compilation/compiler"))
        })
        .expect("compiler artifacts");
    assert!(
        !compiler_artifacts["files"]
            .as_array()
            .expect("artifact files")
            .is_empty(),
    );
}

#[test]
fn soft_tag_dependents_specific_version_untag_and_minor_auto_tag() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(3, true, "");
    helper.soft_tag("");
    helper.persist_tag_without_build("");

    // modify a component that has dependents and soft-tag it
    helper.append_file("comp3/index.js", "");
    helper.soft_tag("comp3");
    let bitmap = helper.read_bit_map();
    assert!(bitmap["comp2"].get("nextVersion").is_some());
    assert!(bitmap["comp1"].get("nextVersion").is_some());

    // soft tag with specific version attached to a component-id
    helper.re_init_workspace();
    helper.populate_components(1, true, "");
    helper.soft_tag("comp1@0.0.5");
    let bitmap = helper.read_bit_map();
    assert_eq!(bitmap["comp1"]["nextVersion"]["version"].as_str(), Some("0.0.5"));

    // untag
    helper.soft_tag("--ver 3.0.0");
    helper.reset_soft("--all");
    let bitmap = helper.read_bit_map();
    assert!(bitmap["comp1"].get("nextVersion").is_none());

    // soft-tag pre-release -> persist the soft-tag
    helper.set_workspace_with_remote_scope();
    helper.populate_components(3, true, "");
    helper.soft_tag("--pre-release dev");
    let tag_output = helper.persist_tag_without_build("");
    assert!(tag_output.contains("comp1@0.0.1-dev.0"));

    // soft tag --minor with auto-tag
    helper.set_workspace_with_remote_scope();
    helper.populate_components(3, true, "");
    helper.tag_all_without_build("");
    helper.append_file("comp2/index.js", "");
    helper.soft_tag("--minor");
    let bitmap = helper.read_bit_map();
    assert_eq!(bitmap["comp2"]["nextVersion"]["version"].as_str(), Some("minor"));
    assert_eq!(bitmap["comp1"]["nextVersion"]["version"].as_str(), Some("patch"));
}

#[test]
fn tag_scope_and_failing_tests_and_tiny_cache() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(3, true, "");
    helper.tag_without_build("comp3@0.0.3", "--skip-tests");
    helper.tag_without_build("comp2@0.0.2", "--skip-tests");
    helper.tag_without_build("comp1@0.0.1", "--skip-tests");
    let before_tag_scope = helper.clone_workspace();

    // without version
    let output = helper.tag_include_unmodified_without_build("", "");
    assert!(output.contains("comp1@0.0.2"));
    assert!(output.contains("comp2@0.0.3"));
    assert!(output.contains("comp3@0.0.4"));

    // without version and --minor flag
    helper.get_cloned_workspace(&before_tag_scope);
    let output = helper.tag_include_unmodified_without_build("", "--minor");
    assert!(output.contains("comp1@0.1.0"));
    assert!(output.contains("comp2@0.1.0"));
    assert!(output.contains("comp3@0.1.0"));

    // with failing tests
    helper.set_workspace_with_remote_scope();
    helper.output_file("bar/index.js", "");
    helper.output_file(
        "bar/foo.spec.js",
        "describe('bar component', () => { it('should fail', () => { expect(true).toBe(false); }); });\n",
    );
    helper.add_component("bar", "");
    let before_test_tag = helper.clone_workspace();

    let err = helper.run_with_try_catch("bit tag --build");
    assert!(err.contains(
        r#"Failed task 1: "teambit.defender/tester:JestTest" of env "teambit.harmony/node""#
    ));
    assert!(
        !helper
            .local_path()
            .join(".bit/staged-config.json")
            .exists(),
    );

    helper.get_cloned_workspace(&before_test_tag);
    helper.tag_all_components("--skip-tests");

    helper.get_cloned_workspace(&before_test_tag);
    helper.tag_all_components("--ignore-build-errors");

    helper.get_cloned_workspace(&before_test_tag);
    helper.tag_all_components("--build --loose");
    let comp = helper.cat_component_parsed("bar@latest");
    assert_eq!(comp["buildStatus"].as_str(), Some("succeed"));

    // with tiny cache
    helper.set_workspace_with_remote_scope();
    helper.populate_components(1, false, "");
    helper.tag_all_without_build("");
    helper.populate_components(1, false, "v2");
    helper.run_cmd("bit config set cache.max.objects 1");
    helper.tag_all_components("");
    helper.run_cmd("bit config del cache.max.objects");
}

#[test]
fn auto_tag_pending_and_incremented_by_and_prerelease_and_versions_file() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(3, true, "");
    helper.tag_all_without_build("");
    helper.append_file("comp3/index.js", "");
    let auto_tag_pending_ws = helper.clone_workspace();

    // tag with specific version
    helper.get_cloned_workspace(&auto_tag_pending_ws);
    helper.tag_all_without_build("--ver 1.0.0");
    let bitmap = helper.read_bit_map();
    assert_eq!(bitmap["comp3"]["version"].as_str(), Some("1.0.0"));
    assert_eq!(bitmap["comp1"]["version"].as_str(), Some("0.0.2"));
    assert_eq!(bitmap["comp2"]["version"].as_str(), Some("0.0.2"));

    // tag with --scope flag
    helper.append_file("comp3/index.js", "");
    helper.tag_include_unmodified_without_build("2.0.0", "");
    let bitmap = helper.read_bit_map();
    assert_eq!(bitmap["comp3"]["version"].as_str(), Some("2.0.0"));
    assert_eq!(bitmap["comp1"]["version"].as_str(), Some("2.0.0"));
    assert_eq!(bitmap["comp2"]["version"].as_str(), Some("2.0.0"));

    // auto-tag with pre-release
    helper.get_cloned_workspace(&auto_tag_pending_ws);
    let tag_output = helper.tag_without_build(
        "comp3",
        "--skip-tests --unmodified --increment prerelease --prerelease-id dev",
    );
    assert!(tag_output.contains("3 component(s) tagged"));
    assert!(tag_output.contains("auto-tagged dependents"));
    let details = helper.run_cmd("bit details");
    assert!(details.contains("comp1@0.0.2-dev.0"));

    // with --auto-tag-increment
    helper.get_cloned_workspace(&auto_tag_pending_ws);
    helper.tag_all_without_build("--major --auto-tag-increment major");
    let bitmap = helper.read_bit_map();
    assert_eq!(bitmap["comp3"]["version"].as_str(), Some("1.0.0"));
    assert_eq!(bitmap["comp2"]["version"].as_str(), Some("1.0.0"));
    assert_eq!(bitmap["comp1"]["version"].as_str(), Some("1.0.0"));

    // with --auto-tag-increment different than the modified level
    helper.get_cloned_workspace(&auto_tag_pending_ws);
    helper.tag_all_without_build("--major --auto-tag-increment minor");
    let bitmap = helper.read_bit_map();
    assert_eq!(bitmap["comp3"]["version"].as_str(), Some("1.0.0"));
    assert_eq!(bitmap["comp2"]["version"].as_str(), Some("0.1.0"));
    assert_eq!(bitmap["comp1"]["version"].as_str(), Some("0.1.0"));

    // --auto-tag-increment along with --skip-auto-tag
    helper.get_cloned_workspace(&auto_tag_pending_ws);
    let result = helper.run_with_try_catch("bit tag --auto-tag-increment major --skip-auto-tag");
    assert!(result.contains(
        "you can use either --auto-tag-increment or --skip-auto-tag, but not both"
    ));

    // --auto-tag-increment with a pre-release level and --prerelease-id
    helper.get_cloned_workspace(&auto_tag_pending_ws);
    helper.tag_all_without_build("--major --auto-tag-increment prerelease --prerelease-id dev");
    let bitmap = helper.read_bit_map();
    assert_eq!(bitmap["comp3"]["version"].as_str(), Some("1.0.0"));
    assert_eq!(bitmap["comp2"]["version"].as_str(), Some("0.0.2-dev.0"));
    assert_eq!(bitmap["comp1"]["version"].as_str(), Some("0.0.2-dev.0"));

    // using --incremented-by flag
    helper.set_workspace_with_remote_scope();
    helper.populate_components(3, true, "");
    helper.tag_all_without_build("");
    let after_first_tag = helper.clone_workspace();

    helper.populate_components(3, true, "v2-patch");
    helper.tag_all_without_build("--increment-by 4");
    let bitmap = helper.read_bit_map();
    assert_eq!(bitmap["comp1"]["version"].as_str(), Some("0.0.5"));
    assert_eq!(bitmap["comp2"]["version"].as_str(), Some("0.0.5"));
    assert_eq!(bitmap["comp3"]["version"].as_str(), Some("0.0.5"));

    helper.get_cloned_workspace(&after_first_tag);
    helper.populate_components(3, true, "v2-minor");
    helper.tag_all_without_build("--minor --increment-by 2");
    let bitmap = helper.read_bit_map();
    assert_eq!(bitmap["comp1"]["version"].as_str(), Some("0.2.0"));
    assert_eq!(bitmap["comp2"]["version"].as_str(), Some("0.2.0"));
    assert_eq!(bitmap["comp3"]["version"].as_str(), Some("0.2.0"));

    helper.get_cloned_workspace(&after_first_tag);
    helper.append_file("comp3/index.js", "");
    helper.tag_all_without_build("--increment-by 3");
    let bitmap = helper.read_bit_map();
    assert_eq!(bitmap["comp1"]["version"].as_str(), Some("0.0.4"));
    assert_eq!(bitmap["comp2"]["version"].as_str(), Some("0.0.4"));
    assert_eq!(bitmap["comp3"]["version"].as_str(), Some("0.0.4"));

    // tag pre-release + increment pre-release
    helper.set_workspace_with_remote_scope();
    helper.populate_components(3, true, "");
    let tag_output = helper.tag_all_without_build("--increment prerelease --prerelease-id dev");
    assert!(tag_output.contains("comp1@0.0.1-dev.0"));
    helper.populate_components(3, true, "v2");
    let tag_output = helper.tag_all_without_build("--increment prerelease");
    assert!(tag_output.contains("comp1@0.0.1-dev.1"));

    // invalid --auto-tag-increment level & invalid pre-release after normal tag
    helper.set_workspace_with_remote_scope();
    helper.populate_components(1, true, "");
    helper.tag_all_without_build("");
    let result = helper.run_with_try_catch("bit tag --unmodified --auto-tag-increment nope");
    assert!(result.contains(r#"invalid auto-tag-increment level "nope""#));

    let result = helper.run_with_try_catch(r#"bit tag --unmodified --pre-release "h?h""#);
    assert!(result.contains("unable to increment"));
    let comp = helper.cat_component_parsed("comp1");
    assert_eq!(comp["head"].as_str(), comp["versions"]["0.0.1"].as_str());
    let pkg_json: Value = serde_json::from_str(&helper.read_file(&format!(
        "node_modules/@{}/comp1/package.json",
        helper.remote_scope(),
    )))
    .expect("pkg json");
    assert_eq!(pkg_json["version"].as_str(), Some("0.0.1"));
    assert_eq!(pkg_json["componentId"]["version"].as_str(), Some("0.0.1"));

    // tagging a snapped component by specifying the id
    helper.set_workspace_with_remote_scope();
    helper.populate_components(1, true, "");
    helper.snap_all_components_without_build("");
    let tag_output = helper.tag_without_build("comp1", "--skip-tests");
    assert!(tag_output.contains("comp1@0.0.1"));

    // tag with versions file
    helper.set_workspace_with_remote_scope();
    helper.populate_components(3, true, "");
    let versions_file_content = format!(
        "# Default version for unspecified components\nDEFAULT: minor\n\n# Component-specific versions\n{}/comp1: 2.0.0\n{}/comp3: 1.5.0",
        helper.remote_scope(),
        helper.remote_scope(),
    );
    helper.output_file("versions.txt", &versions_file_content);
    helper.tag_all_without_build("--versions-file versions.txt");
    let bitmap = helper.read_bit_map();
    assert_eq!(bitmap["comp1"]["version"].as_str(), Some("2.0.0"));
    assert_eq!(bitmap["comp2"]["version"].as_str(), Some("0.1.0"));
    assert_eq!(bitmap["comp3"]["version"].as_str(), Some("1.5.0"));
    let status = helper.status();
    assert!(status.contains("comp1 - versions: 2.0.0"));
    assert!(status.contains("comp2 - versions: 0.1.0"));
    assert!(status.contains("comp3 - versions: 1.5.0"));
}
