use super::support::{compare, workspace};
use crate::helper::config;
use serde_json::json;
#[test]
fn multiple_paths_globs_scope_env_and_json_match_published_add() {
    for command in [
        "add first second",
        r#"add "*" --json"#,
        "add first -i named/component -s custom.scope",
        "add first -i named/component -e teambit.harmony/node",
        "add first -i named/component --override false",
    ] {
        let helper = workspace();
        helper.output_file("first/index.js", "module.exports=1;\n");
        helper.output_file("second/index.js", "module.exports=2;\n");
        compare(&helper, command);
    }
}
#[test]
fn track_all_files_retains_authored_manifests_and_tsconfig() {
    let helper = workspace();
    config::set_workspace_aspect_key(&helper.scopes.local_path, "trackAllFiles", json!(true));
    helper.output_file("comp1/index.js", "module.exports=1;\n");
    helper.output_file("comp1/package.json", "{\"name\":\"authored\",\"version\":\"0.0.1\"}\n");
    helper.output_file("comp1/tsconfig.json", "{}\n");
    compare(&helper, "add comp1 -i comp1");
}
#[test]
fn existing_component_can_update_main_without_replacing_authored_config() {
    let helper = workspace();
    helper.output_file("comp1/index.js", "module.exports=1;\n");
    helper.run("add comp1 -i comp1");
    helper.output_file("comp1/entry.js", "module.exports=2;\n");
    helper.output_file(
        "comp1/component.json",
        "{\"teambit.pkg/pkg\":{\"packageJson\":{\"custom\":true}}}\n",
    );
    compare(&helper, "add comp1 -i comp1 -m entry.js");
}

#[test]
fn a_hundred_components_with_eleven_files_keep_native_capture_frames_bounded() {
    let helper = workspace();
    for component in 0..100 {
        let directory = format!("components/component-{component:03}");
        for file in 0..10 {
            helper.output_file(
                &format!("{directory}/file-{file}.js"),
                &format!("module.exports={component};\n"),
            );
        }
        helper.output_file(
            &format!("{directory}/index.js"),
            &format!("module.exports={component};\n"),
        );
    }
    let result = compare(&helper, r#"add "components/*""#);
    assert!(result.status.success(), "{}", result.stderr);
    let bitmap = config::read_jsonc(&helper.scopes.local_path.join(".bitmap"));
    let entries: Vec<_> = bitmap
        .as_object()
        .unwrap()
        .values()
        .filter(|row| row["rootDir"].is_string())
        .collect();
    assert_eq!(entries.len(), 100);
    for entry in entries {
        assert_component_links(&helper, entry);
    }
}

fn assert_component_links(helper: &crate::helper::Helper, entry: &serde_json::Value) {
    let name = entry["name"].as_str().unwrap();
    let package = helper.scopes.local_path.join(format!(
        "node_modules/@{}/{}",
        helper.scopes.remote,
        name.replace('/', "."),
    ));
    assert_eq!(entry["mainFile"], "index.js");
    assert!(package.join("package.json").is_file(), "missing package {name}");
    assert!(package.join("index.js").exists(), "missing source link {name}");
    for file in 0..10 {
        assert!(
            package
                .join(format!("file-{file}.js"))
                .exists(),
            "missing file-{file} link in {name}",
        );
    }
}
