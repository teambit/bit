//! `e2e/flows/big-file.e2e.ts`.

use crate::helper::{FOO_FIXTURE, Helper};
use std::{fs, path::Path};

fn fixture_content() -> String {
    let path =
        Path::new(env!("CARGO_MANIFEST_DIR")).join("../../e2e/fixtures/big-text-file-fixture.txt");
    let content = fs::read_to_string(path).expect("read big text file fixture");
    content
        .replace("\r\n", "\n")
        .replace('\r', "\n")
        .replace('\n', "\r\n")
}

fn setup_big_file(helper: &Helper) -> String {
    helper.set_workspace_with_remote_scope();
    let content = fixture_content();
    helper.output_file("bar/big-text-file.txt", &content);
    helper.create_component_bar_foo(FOO_FIXTURE);
    helper.run("add bar -i bar/text -m bar/foo.js");
    helper.native("tag bar/text --ignore-issues *")
}

/// big text file › Windows format (\\r\\n) › tagging the component should not throw any error
#[test]
fn tagging_the_component_should_not_throw_any_error() {
    let helper = Helper::new();
    let tag_output = setup_big_file(&helper);
    assert!(tag_output.contains("1 component(s) tagged"), "{tag_output}");
}

/// big text file › Windows format (\\r\\n) › exporting and importing the component › should work with no errors
#[test]
fn should_work_with_no_errors() {
    let helper = Helper::new();
    setup_big_file(&helper);
    crate::helper::remote::publish(&helper);
    helper.re_init_workspace();
    helper.add_remote_scope();
    let import_output = helper.run(&format!("import {}/bar/text", helper.scopes.remote));
    assert!(import_output.contains("successfully imported one component"), "{import_output}");
}

/// big text file › Windows format (\\r\\n) › exporting and importing the component › should import the big file
#[test]
fn should_import_the_big_file() {
    let helper = Helper::new();
    setup_big_file(&helper);
    crate::helper::remote::publish(&helper);
    helper.re_init_workspace();
    helper.add_remote_scope();
    helper.run(&format!("import {}/bar/text", helper.scopes.remote));
    let file_path =
        helper.scopes.local_path.join(&helper.scopes.remote).join("bar/text/big-text-file.txt");
    assert!(file_path.is_file(), "expected file at {}", file_path.display());
    assert!(fs::metadata(&file_path).unwrap().len() > 0);
}
