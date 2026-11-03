//! End-to-end tests for original `bit move` directory, imported-directory, and manually moved source contracts ([`workspace`], [`cleanup`], [`internal`], [`providers`]).
//!
//! Validates physical source relocation, `.bitmap` root updates, and aspect provider integration via [`compare`] and [`successful`].

pub(crate) mod support;

mod cleanup;
mod internal;
mod providers;

use crate::helper::{Helper, remote};
use std::fs;
use support::{bitmap, compare, json, setup, successful};

/// Creates a [`Helper`] workspace with `bar/foo` tracking `foo1.js`, `foo2.js`, and `foo1.spec.js`.
fn workspace() -> Helper {
    let helper = support::workspace(0, false);
    for file in ["foo1.js", "foo2.js", "foo1.spec.js"] {
        helper.output_file(&format!("bar/{file}"), "module.exports=1;\n");
    }
    setup(&helper, "add bar -i bar/foo -m bar/foo1.js");
    helper
}
/// Verifies `bit move bar utils` relocates physical source files and updates [`bitmap`] `rootDir` via [`successful`].
#[test]
fn directory_move_changes_physical_sources_and_bitmap_root() {
    let helper = workspace();
    let result = successful(&helper, "move bar utils");
    assert!(result.stdout.contains("moved component"));
    assert_eq!(bitmap(&helper)["bar/foo"]["rootDir"], "utils");
    assert!(!helper.scopes.local_path.join("bar").exists());
    for file in ["foo1.js", "foo2.js", "foo1.spec.js"] {
        assert!(
            helper.scopes.local_path
                .join("utils")
                .join(file)
                .is_file(),
        );
    }
}
/// Verifies moving `bar` to `bar2` succeeds without treating the shared prefix as a nested path.
#[test]
fn destination_sharing_the_source_prefix_is_not_a_nested_directory() {
    let helper = workspace();
    assert!(successful(&helper, "move bar bar2").stdout.contains("moved component"));
    assert_eq!(bitmap(&helper)["bar/foo"]["rootDir"], "bar2");
}
/// Verifies a manually moved tagged directory updates [`bitmap`] metadata without repeating the filesystem move.
#[test]
fn manually_moved_tagged_directory_updates_metadata_without_repeating_the_move() {
    let helper = workspace();
    support::tag(&helper);
    fs::rename(helper.scopes.local_path.join("bar"), helper.scopes.local_path.join("baz")).unwrap();
    successful(&helper, "move bar baz");
    assert_eq!(bitmap(&helper)["bar/foo"]["rootDir"], "baz");
}
/// Verifies moving an imported component directory preserves clean `bit status --json` via [`json`].
#[test]
fn imported_directory_move_preserves_clean_component_status() {
    let helper = workspace();
    support::tag(&helper);
    remote::publish(&helper);
    helper.re_init_workspace();
    helper.add_remote_scope();
    setup(&helper, &format!("import {}/bar/foo --path components/bar -x", helper.scopes.remote));
    successful(&helper, "move components/bar components/utils");
    assert!(!helper.scopes.local_path.join("components/bar").exists());
    assert!(helper.scopes.local_path.join("components/utils/foo1.js").is_file());
    assert_eq!(bitmap(&helper)["bar/foo"]["rootDir"], "components/utils");
    assert!(
        json(&helper, "status --json")["modifiedComponents"]
            .as_array()
            .unwrap()
            .is_empty(),
    );
}
#[test]
fn occupied_destinations_and_missing_sources_match_node_without_partial_changes() {
    for command in ["move bar occupied", "move missing somewhere"] {
        let helper = workspace();
        helper.output_file("occupied/preserved.txt", "preserve\n");
        let output = compare(&helper, command);
        assert!(!output.status.success());
        assert_eq!(
            fs::read_to_string(helper.scopes.local_path.join("occupied/preserved.txt")).unwrap(),
            "preserve\n",
        );
    }
}
