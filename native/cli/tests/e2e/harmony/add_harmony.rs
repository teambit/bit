use crate::helper::Helper;
use serde_json::Value;

#[path = "add_harmony/extra.rs"]
mod extra;

#[test]
fn workspace_root_component_bitmap_convergence_and_removing() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.output_file("comp1/index.js", "module.exports = () => \"comp1\";\n");
    helper.add_component("comp1", "-i comp1");
    helper.output_file("README.md", "# workspace root\n");
    helper.add_component(".", "-i ws-root --root");
    helper.native(r#"snap --skip-tests --ignore-issues "*""#);

    // should not be modified right after snapping, despite tracking .bitmap
    let status = helper.status_json();
    assert_eq!(status["modifiedComponents"].as_array().map(Vec::len), Some(0));

    // should not be modified on the quick-status path either, which hashes the files on disk
    let quick_status: Value = serde_json::from_str(&helper.run_cmd("bit status --quick --json"))
        .expect("quick status json");
    assert_eq!(quick_status["modified"].as_array().map(Vec::len), Some(0));

    // adding a new component inside the workspace root
    let root_head_before = helper.get_head("ws-root");
    helper.output_file("comp2/index.js", "module.exports = () => \"comp2\";\n");
    helper.add_component("comp2", "-i comp2");

    let root_files = helper.get_component_files("ws-root");
    assert!(
        !root_files
            .iter()
            .any(|f| f.starts_with("comp2/")),
    );

    let status = helper.status_json();
    assert_eq!(status["modifiedComponents"].as_array().map(Vec::len), Some(1));

    // snapping only the new component
    let output = helper.native(r#"snap comp2 --skip-tests --ignore-issues "*""#);
    let root_head_after = helper.get_head("ws-root");
    assert_ne!(root_head_after, root_head_before);
    assert!(output.contains("is the workspace-root component"));

    let comp2 = helper.cat_component_parsed("comp2@latest");
    let root_data = comp2["extensions"]
        .as_array()
        .and_then(|exts| {
            exts.iter()
                .find(|ext| ext["name"].as_str() == Some("teambit.workspace/workspace-root"))
        })
        .and_then(|e| e.get("data"))
        .expect("workspace-root extension data");
    assert_eq!(
        root_data["root"].as_str(),
        Some(format!("{}/ws-root@{root_head_after}", helper.remote_scope()).as_str()),
    );

    let status = helper.status_json();
    assert_eq!(status["modifiedComponents"].as_array().map(Vec::len), Some(0));

    // removing the workspace-root component
    helper.re_init_workspace();
    helper.output_file("comp1/index.js", "module.exports = () => \"comp1\";\n");
    helper.add_component("comp1", "-i comp1");
    helper.output_file("README.md", "# workspace root\n");
    helper.output_file("untracked-by-bit.txt", "not a component file\n");
    helper.add_component(".", "-i ws-root --root");
    let package_name = format!("@{}/ws-root", helper.remote_scope());
    helper.output_file(&format!("node_modules/{package_name}/index.js"), "");
    helper.output_file(
        "package.json",
        &format!(r#"{{"dependencies":{{"{package_name}":"1.0.0"}}}}"#),
    );
    helper.remove_component("ws-root", "--silent");

    let pkg_json: Value =
        serde_json::from_str(&helper.read_file("package.json")).expect("package.json");
    assert!(pkg_json["dependencies"].get(&package_name).is_some());
    assert!(
        helper
            .local_path()
            .join(".bitmap")
            .exists(),
    );
    assert!(
        helper
            .local_path()
            .join("comp1/index.js")
            .exists(),
    );
    assert!(
        helper
            .local_path()
            .join("untracked-by-bit.txt")
            .exists(),
    );
    assert!(
        helper
            .local_path()
            .join("README.md")
            .exists(),
    );
    let bitmap = helper.read_bit_map();
    assert!(bitmap.get("comp1").is_some());
    assert!(
        helper
            .local_path()
            .join(format!("node_modules/{package_name}/index.js"))
            .exists(),
    );
}

#[test]
fn writing_workspace_root_component_to_filesystem_and_member_imported_without_root() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.output_file("comp1/index.js", "module.exports = () => \"comp1\";\n");
    helper.add_component("comp1", "-i comp1");
    helper.output_file("README.md", "# workspace root\n");
    helper.output_file("docs/guide.md", "# guide\n");
    helper.add_component(".", "-i ws-root --root");
    helper.native(r#"snap --skip-tests --ignore-issues "*""#);
    helper.output_file("README.md", "# workspace root v2\n");
    helper.native(r#"snap --skip-tests --ignore-issues "*""#);
    helper.native("export");

    // importing it into another workspace
    helper.re_init_workspace();
    helper.add_remote_scope();
    helper.import_component("ws-root", "-x");
    assert!(
        helper
            .local_path()
            .join(".bitmap")
            .exists(),
    );
    assert!(
        !helper
            .local_path()
            .join("ws-root/.bitmap")
            .exists(),
    );
    let status = helper.status_json();
    assert_eq!(status["modifiedComponents"].as_array().map(Vec::len), Some(0));

    // importing it onto the root of an empty workspace
    helper.re_init_workspace();
    helper.add_remote_scope();
    helper.import_component("ws-root", "--path . -x");
    assert_eq!(helper.read_file("README.md"), "# workspace root v2\n");
    let bitmap = helper.read_bit_map();
    assert_eq!(bitmap["ws-root"]["rootDir"].as_str(), Some("."));
    assert_eq!(helper.get_component_env("ws-root"), "teambit.harmony/empty-env");
    assert!(bitmap.get("comp1").is_none());

    let remote = helper.remote_scope().to_string();

    // should refuse to move it out of the workspace root
    let err = helper.run_with_try_catch(&format!(
        "bit import {remote}/ws-root --path some-dir --override -x",
    ));
    assert!(err.contains("tracked at the workspace root"), "{err}");
    assert!(
        helper
            .local_path()
            .join("workspace.jsonc")
            .exists(),
    );
    assert!(
        helper
            .local_path()
            .join(".bitmap")
            .exists(),
    );

    // should refuse a second import without --override once the user changed a root file
    helper.add_key_val_to_workspace("name", Value::String("renamed".to_string()));
    let err = helper.run_with_try_catch(&format!("bit import {remote}/ws-root --path . -x"));
    assert!(err.contains("due to local changes"), "{err}");
    assert_eq!(
        helper.read_workspace_jsonc()["teambit.workspace/workspace"]["name"].as_str(),
        Some("renamed"),
    );

    // should refuse to write through a symlink in the way of a root file even with --override
    #[cfg(unix)]
    {
        let outside = helper
            .e2e_dir()
            .join(format!(
                "outside-{}",
                helper
                    .local_path()
                    .file_name()
                    .and_then(|s| s.to_str())
                    .unwrap_or("ws"),
            ));
        std::fs::create_dir_all(&outside).expect("create outside dir");
        let _ = std::fs::remove_dir_all(helper.local_path().join("docs"));
        std::os::unix::fs::symlink(&outside, helper.local_path().join("docs"))
            .expect("symlink docs");
        let err = helper.run_with_try_catch(&format!("bit import {remote}/ws-root --override -x"));
        assert!(err.contains("symbolic link"), "{err}");
        assert!(!outside.join("guide.md").exists());
        let _ = std::fs::remove_dir_all(&outside);
    }

    // importing it onto the root of a fresh workspace that has its own files
    helper.re_init_workspace();
    helper.add_remote_scope();
    helper.output_file("README.md", "# my own readme\n");
    let err = helper.run_with_try_catch(&format!("bit import {remote}/ws-root --path . -x"));
    assert!(err.contains("use --override"), "{err}");
    assert_eq!(helper.read_file("README.md"), "# my own readme\n");

    // importing it onto the root with a directory in the way
    helper.re_init_workspace();
    helper.add_remote_scope();
    std::fs::create_dir_all(helper.local_path().join("README.md")).expect("dir at README.md");
    let err = helper.run_with_try_catch(&format!("bit import {remote}/ws-root --path . -x"));
    assert!(err.contains("use --override"), "{err}");

    // importing it onto the root of a workspace that already tracks components
    helper.re_init_workspace();
    helper.add_remote_scope();
    helper.output_file("comp2/index.js", "module.exports = () => \"comp2\";\n");
    helper.add_component("comp2", "-i comp2");
    helper.output_file("README.md", "# my own readme\n");
    let err = helper.run_with_try_catch(&format!("bit import {remote}/ws-root --path . -x"));
    assert!(err.contains("use --override"), "{err}");
    assert_eq!(helper.read_file("README.md"), "# my own readme\n");

    helper.import_component("ws-root", "--path . --override -x");
    assert_eq!(helper.read_file("README.md"), "# workspace root v2\n");

    // a member imported on its own into a workspace that has no root
    helper.set_workspace_with_remote_scope();
    helper.output_file("comp1/index.js", "module.exports = () => \"comp1\";\n");
    helper.add_component("comp1", "-i comp1");
    helper.output_file("README.md", "# workspace root\n");
    helper.add_component(".", "-i ws-root --root");
    helper.native(r#"tag --skip-tests --ignore-issues "*""#);
    helper.native("export");
    let root_id_with_version = format!("{}/ws-root@0.0.1", helper.remote_scope());

    helper.re_init_workspace();
    helper.add_remote_scope();
    helper.import_component("comp1", "-x");
    let bitmap_after_import = helper.read_bit_map();
    let comp1_v1 = helper.cat_component_parsed("comp1@0.0.1");
    let root_data_v1 = comp1_v1["extensions"]
        .as_array()
        .and_then(|exts| {
            exts.iter()
                .find(|ext| ext["name"].as_str() == Some("teambit.workspace/workspace-root"))
        })
        .and_then(|e| e.get("data"))
        .expect("root data v1");
    assert_eq!(root_data_v1["root"].as_str(), Some(root_id_with_version.as_str()));
    assert!(bitmap_after_import.get("ws-root").is_none());
    let list_ids: Vec<String> = helper
        .list_parsed()
        .as_array()
        .expect("list")
        .iter()
        .filter_map(|comp| comp["id"].as_str().map(String::from))
        .collect();
    assert_eq!(list_ids, vec![format!("{}/comp1", helper.remote_scope())]);

    // tagging it here, where there is no root to record
    helper.native("tag --skip-tests --unmodified");
    let comp1_v2 = helper.cat_component_parsed("comp1@0.0.2");
    let root_data_v2 = comp1_v2["extensions"]
        .as_array()
        .and_then(|exts| {
            exts.iter()
                .find(|ext| ext["name"].as_str() == Some("teambit.workspace/workspace-root"))
        })
        .and_then(|e| e.get("data"));
    assert!(
        root_data_v2
            .and_then(|d| d.get("root"))
            .is_none(),
    );

    let comp1_v1_after = helper.cat_component_parsed("comp1@0.0.1");
    let root_data_v1_after = comp1_v1_after["extensions"]
        .as_array()
        .and_then(|exts| {
            exts.iter()
                .find(|ext| ext["name"].as_str() == Some("teambit.workspace/workspace-root"))
        })
        .and_then(|e| e.get("data"))
        .expect("root data v1 after");
    assert_eq!(root_data_v1_after["root"].as_str(), Some(root_id_with_version.as_str()));
}
