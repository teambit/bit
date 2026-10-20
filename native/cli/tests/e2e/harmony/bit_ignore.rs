//! `e2e/harmony/bit-ignore.e2e.ts`.

use crate::helper::{Helper, config, parse};
use serde_json::json;

fn populate_comp1(helper: &Helper) {
    helper.output_file("comp1/index.js", "module.exports = () => 'comp1';");
    helper.run("add comp1");
}

fn component_files(helper: &Helper) -> Vec<String> {
    let cat = parse(&helper.native("cat comp1 --json"));
    cat["files"]
        .as_array()
        .unwrap()
        .iter()
        .map(|entry| {
            entry["path"]
                .as_str()
                .unwrap()
                .to_owned()
        })
        .collect()
}

/// Bit Ignore functionality › adding .bitignore in a comp dir › should respect the .bitignore file and ignore according to the pattern
#[test]
fn adding_bitignore_in_a_comp_dir() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    populate_comp1(&helper);
    helper.output_file("comp1/.bitignore", "*.json");
    helper.output_file("comp1/hello.json", r#"{"hello": "world"}"#);

    let files = component_files(&helper);
    assert!(
        files
            .iter()
            .any(|file| file == ".bitignore"),
        "{files:?}",
    );
    assert!(
        !files
            .iter()
            .any(|file| file == "hello.json"),
        "{files:?}",
    );
    assert!(
        files
            .iter()
            .any(|file| file == "index.js"),
        "{files:?}",
    );
}

/// Bit Ignore functionality › adding .bitignore in the root dir › should respect the .bitignore file and ignore according to the pattern
#[test]
fn adding_bitignore_in_the_root_dir() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    populate_comp1(&helper);
    helper.output_file(".bitignore", "*.json");
    helper.output_file("comp1/hello.json", r#"{"hello": "world"}"#);

    let files = component_files(&helper);
    assert!(
        !files
            .iter()
            .any(|file| file == "hello.json"),
        "{files:?}",
    );
    assert!(
        files
            .iter()
            .any(|file| file == "index.js"),
        "{files:?}",
    );
}

/// Bit Ignore functionality › adding .gitignore and an empty .bitignore in the root dir › should only consider the .bitignore and ignore the .gitignore file
#[test]
fn adding_gitignore_and_an_empty_bitignore_in_the_root_dir() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    populate_comp1(&helper);
    helper.output_file(".gitignore", "*.json");
    helper.output_file(".bitignore", "");
    helper.output_file("comp1/hello.json", r#"{"hello": "world"}"#);

    let files = component_files(&helper);
    assert!(
        files
            .iter()
            .any(|file| file == "hello.json"),
        "{files:?}",
    );
}

/// Bit Ignore functionality › adding only .gitignore in the component dir › should consider the .gitignore, ignore the patterns in it, but track this .gitignore file
#[test]
fn adding_only_gitignore_in_the_component_dir() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    populate_comp1(&helper);
    helper.output_file("comp1/.gitignore", "*.json");
    helper.output_file("comp1/hello.json", r#"{"hello": "world"}"#);

    let files = component_files(&helper);
    assert!(
        files
            .iter()
            .any(|file| file == ".gitignore"),
        "{files:?}",
    );
    assert!(
        !files
            .iter()
            .any(|file| file == "hello.json"),
        "{files:?}",
    );
}

/// Bit Ignore functionality › using ignoredFiles config in workspace.jsonc › should ignore files matching the configured patterns
#[test]
fn using_ignored_files_config_in_workspace_jsonc() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    populate_comp1(&helper);
    config::set_workspace_aspect_key(
        &helper.scopes.local_path,
        "ignoredFiles",
        json!(["hello.json"]),
    );
    helper.output_file("comp1/hello.json", r#"{"hello": "world"}"#);

    let files = component_files(&helper);
    assert!(
        !files
            .iter()
            .any(|file| file == "hello.json"),
        "{files:?}",
    );
    assert!(
        files
            .iter()
            .any(|file| file == "index.js"),
        "{files:?}",
    );
}

/// Bit Ignore functionality › adding .gitignore and .bitignore in the component dir › .bitignore should take precedence
#[test]
fn adding_gitignore_and_bitignore_in_the_component_dir() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    populate_comp1(&helper);
    helper.output_file("comp1/.bitignore", "");
    helper.output_file("comp1/.gitignore", "*.json");
    helper.output_file("comp1/hello.json", r#"{"hello": "world"}"#);

    let files = component_files(&helper);
    assert!(
        files
            .iter()
            .any(|file| file == ".gitignore"),
        "{files:?}",
    );
    assert!(
        files
            .iter()
            .any(|file| file == "hello.json"),
        "{files:?}",
    );
}
