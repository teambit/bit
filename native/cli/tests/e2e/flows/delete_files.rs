//! `e2e/flows/delete-files.e2e.ts`.

use crate::helper::{FOO_FIXTURE, Helper, parse};

/// delete files from a component › after adding it › bit status should not throw an error and should show it as a new component
#[test]
fn after_adding_it() {
    let helper = Helper::new();
    helper.re_init_workspace();
    helper.create_component_bar_foo(FOO_FIXTURE);
    helper.output_file("bar/baz.js", FOO_FIXTURE);
    helper.native("add bar -i bar/foo -m bar/foo.js");
    helper.delete_path("bar/baz.js");

    let status_output = helper.native("status");
    assert!(status_output.contains("new components"), "{status_output}");
    assert!(status_output.contains("bar/foo"), "{status_output}");
}

/// delete files from a component › tag and then delete a file › bit status should show the component as modified
#[test]
fn tag_and_then_delete_a_file() {
    let helper = Helper::new();
    helper.re_init_workspace();
    helper.create_component_bar_foo(FOO_FIXTURE);
    helper.output_file("bar/baz.js", FOO_FIXTURE);
    helper.native("add bar -i bar/foo -m bar/foo.js");
    helper.native("tag bar/foo --ignore-issues *");
    helper.delete_path("bar/baz.js");

    let output = helper.native("status");
    assert!(output.contains("modified components"), "{output}");
    assert!(output.contains("bar/foo"), "{output}");
}

/// delete files from a component › adding a file, tagging it, deleting it and then tagging again › should not show the deleted file in bit show command
#[test]
fn adding_a_file_tagging_it_deleting_it_and_then_tagging_again() {
    let helper = Helper::new();
    helper.re_init_workspace();
    helper.create_component_bar_foo(FOO_FIXTURE);
    helper.output_file("bar/baz.js", FOO_FIXTURE);
    helper.native("add bar -i bar/foo -m bar/foo.js");
    helper.native("tag bar/foo --ignore-issues *");
    helper.delete_path("bar/baz.js");
    helper.native("tag bar/foo --ignore-issues *");

    let cat = parse(&helper.native("cat bar/foo --json"));
    let files = cat["files"]
        .as_array()
        .unwrap()
        .iter()
        .map(|entry| {
            entry["path"]
                .as_str()
                .unwrap()
                .to_owned()
        })
        .collect::<Vec<_>>();
    assert!(
        files
            .iter()
            .any(|file| file == "foo.js"),
        "{files:?}",
    );
    assert!(
        !files
            .iter()
            .any(|file| file == "baz.js"),
        "{files:?}",
    );
}
