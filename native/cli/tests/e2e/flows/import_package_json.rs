//! Port of `e2e/flows/import-package-json.e2e.ts` for default `package.json` exclusion during tracking ([`should_not_track_the_package_json_file`]).
//!
//! Ensures `bit add` ignores component directory `package.json` files by default.

use crate::helper::{Helper, parse};

/// Verifies `bit add` ignores `package.json` inside a component directory by default.
#[test]
fn should_not_track_the_package_json_file() {
    let helper = Helper::new();
    helper.re_init_workspace();
    helper.output_file("bar/package.json", "{}");
    helper.output_file("bar/foo.js", "module.exports = {};");
    helper.run("add bar");
    helper.run("tag");

    let output = helper.run("cat-component bar@latest --json");
    let json_start = output.find('{').expect("json start");
    let cat = parse(&output[json_start..]);
    let files = cat["files"].as_array().expect("files array");
    assert_eq!(files.len(), 1, "expected only 1 file, got: {files:?}");
}
