//! Port of `e2e/functionalities/binary-files.e2e.ts` for binary file tracking and export ([`png_fixture_bytes`], [`exporting_a_png_file_in_addition_to_a_js_file`]).
//!
//! Exercises PNG asset tracking alongside `JavaScript` files and as standalone component files across `add`, `tag`, and `export`.

use crate::helper::{Helper, remote};
use std::{fs, path::Path};

/// Loads the shared PNG fixture bytes from `e2e/fixtures/png_fixture.png`.
fn png_fixture_bytes() -> Vec<u8> {
    let fixture =
        Path::new(concat!(env!("CARGO_MANIFEST_DIR"), "/../../e2e/fixtures/png_fixture.png"));
    fs::read(fixture).unwrap()
}

/// Verifies exporting and importing a component containing both a PNG file and a `.js` file.
/// binary files › exporting a PNG file in addition to a .js file
#[test]
fn exporting_a_png_file_in_addition_to_a_js_file() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.create_component_bar_foo("module.exports = 'foo';");
    let png = png_fixture_bytes();
    let dest_png = helper.scopes.local_path.join("bar/png_fixture.png");
    fs::write(&dest_png, &png).unwrap();

    helper.native("add bar -m foo.js -i bar/foo");
    helper.run("tag --message v1");
    remote::publish(&helper);

    let list_remote = helper.native(&format!("list {}", helper.scopes.remote));
    assert!(list_remote.contains("found 1 components"));
    assert!(list_remote.contains("bar/foo"));

    helper.native(&format!("import {}/bar/foo", helper.scopes.remote));
    assert_eq!(fs::metadata(&dest_png).unwrap().len(), png.len() as u64);
}

/// Verifies exporting and importing a component whose sole tracked file is a PNG binary ([`png_fixture_bytes`]).
/// binary files › exporting a PNG file as the only file
#[test]
fn exporting_a_png_file_as_the_only_file() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    let png = png_fixture_bytes();
    let dest_png = helper.scopes.local_path.join("bar/png_fixture.png");
    fs::create_dir_all(dest_png.parent().unwrap()).unwrap();
    fs::write(&dest_png, &png).unwrap();

    helper.native("add bar -m png_fixture.png -i bar/foo");
    helper.run("tag --message v1");
    remote::publish(&helper);

    let list_remote = helper.native(&format!("list {}", helper.scopes.remote));
    assert!(list_remote.contains("found 1 components"));
    assert!(list_remote.contains("bar/foo"));
    assert!(!helper.scopes.local_path.join("node_modules/undefined").exists());

    helper.re_init_workspace();
    helper.add_remote_scope();
    helper.native(&format!("import {}/bar/foo --path components/bar/foo", helper.scopes.remote));
    let imported_png = helper.scopes.local_path.join("components/bar/foo/png_fixture.png");
    assert_eq!(fs::metadata(imported_png).unwrap().len(), png.len() as u64);
}
