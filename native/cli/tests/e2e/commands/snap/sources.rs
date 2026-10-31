//! Snapshot source manifests use the published linker's package.json exclusion rule.
use crate::helper::{Helper, config};
use std::{
    collections::BTreeMap,
    ffi::OsStr,
    fs,
    io::Read,
    path::{Path, PathBuf},
};

#[test]
fn tracked_package_json_is_linked_without_generated_metadata_matching_node() {
    let helper = Helper::new();
    helper.re_init_workspace_with(false);
    config::set_workspace_aspect_key(
        &helper.scopes.local_path,
        "trackAllFiles",
        serde_json::json!(true),
    );
    helper.create_component_bar_foo("module.exports = 'tracked package';");
    helper.output_file(
        "bar/package.json",
        r#"{"name":"tracked-source","version":"7.8.9","custom":true}"#,
    );
    helper.run("add bar -i bar/foo -m foo.js");
    helper.delete_path("node_modules/@my-scope/bar.foo");
    let baseline = helper.clone_workspace();
    let expected = Helper::cmd_in_with(
        &baseline,
        "tag --message tracked",
        &[("BIT_NATIVE", OsStr::new("off"))],
    );
    let actual = helper.native_run("tag --message tracked");
    assert!(expected.status.success(), "{}", expected.stderr);
    assert!(actual.status.success(), "{}", actual.stderr);
    assert_eq!(actual.stdout, expected.stdout);
    assert_eq!(actual.stderr, expected.stderr);
    let relative = "node_modules/@my-scope/bar.foo/package.json";
    assert_eq!(
        fs::read(helper.scopes.local_path.join(relative)).unwrap(),
        fs::read(baseline.join(relative)).unwrap(),
    );
    assert_eq!(
        fs::read(helper.scopes.local_path.join("bar/package.json")).unwrap(),
        fs::read(baseline.join("bar/package.json")).unwrap(),
    );
    assert_eq!(source_objects(&helper.scopes.local_path), source_objects(&baseline));
    let relative = ".bitmap";
    assert_eq!(
        config::read_jsonc(&helper.scopes.local_path.join(relative)),
        config::read_jsonc(&baseline.join(relative)),
    );
}

fn source_objects(root: &Path) -> BTreeMap<PathBuf, Vec<u8>> {
    super::super::remove::scope_objects(root)
        .into_iter()
        .filter_map(|(path, compressed)| {
            let mut bytes = Vec::new();
            flate2::read::ZlibDecoder::new(compressed.as_slice()).read_to_end(&mut bytes).unwrap();
            bytes
                .starts_with(b"Source ")
                .then_some((path, bytes))
        })
        .collect()
}
