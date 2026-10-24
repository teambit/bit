//! `e2e/flows/import-package-json.e2e.ts`.

use crate::helper::{Helper, parse};

/// component with package.json as a file of the component › bit version >= 14.8.0 should ignore package.json files altogether › should not track the package.json file
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
