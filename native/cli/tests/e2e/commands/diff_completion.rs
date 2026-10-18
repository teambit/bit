//! Remaining workspace diff selection and presentation parity.
pub(crate) mod http;
mod remote_fixture;
mod sibling_order;

use remote_fixture::publish_remote_fixture;

use crate::helper::Helper;
use std::ffi::OsStr;

fn workspace() -> Helper {
    let helper = Helper::new();
    helper.re_init_workspace();
    helper.create_component_bar_foo("module.exports = 'one';");
    helper.add_component_bar_foo();
    helper.output_file("baz/qux.js", "module.exports = 'two';");
    helper.run("add baz -i baz/qux");
    helper.tag_without_build("", "");
    helper.create_component_bar_foo("module.exports = 'changed one';");
    helper.output_file("baz/qux.js", "module.exports = 'changed two';");
    helper
}

fn parity(helper: &Helper, command: &str) {
    let baseline = helper.clone_workspace();
    let expected = Helper::cmd_in_with(&baseline, command, &[("BIT_NATIVE", OsStr::new("off"))]);
    let actual = helper.cmd(command);
    assert!(actual.native, "{}", actual.trace);
    assert_eq!(actual.status.code(), expected.status.code(), "{}", actual.stderr);
    assert_eq!(actual.stdout, expected.stdout);
    assert_eq!(actual.stderr, expected.stderr);
}

#[test]
fn glob_diff_selects_multiple_components() {
    parity(&workspace(), "diff ** --json");
}

#[test]
fn comma_and_negated_globs_select_diff_components() {
    parity(&workspace(), "diff **,!**/baz/** --name-only");
}

#[test]
fn dependency_table_matches_node() {
    let helper = workspace();
    helper.run("deps set bar/foo lodash@1.0.0 --dev");
    parity(&helper, "diff bar/foo --table");
}

#[test]
fn dependency_table_json_matches_node() {
    let helper = workspace();
    helper.run("deps set bar/foo lodash@1.0.0 --dev");
    parity(&helper, "diff bar/foo --table --json");
}

#[test]
fn verbose_diff_matches_node() {
    let helper = workspace();
    helper.run("deps set bar/foo lodash@1.0.0 --dev");
    parity(&helper, "diff bar/foo --verbose --json");
}

#[test]
fn configured_git_executable_matches_node() {
    let helper = workspace();
    let baseline = helper.clone_workspace();
    let variables = [("BIT_CONFIG_GIT_PATH", OsStr::new("git"))];
    let mut node_variables = variables.to_vec();
    node_variables.push(("BIT_NATIVE", OsStr::new("off")));
    let expected = Helper::cmd_in_with(&baseline, "diff ** --json", &node_variables);
    let actual = Helper::cmd_in_with(&helper.scopes.local_path, "diff ** --json", &variables);
    assert!(actual.native, "{}", actual.trace);
    assert_eq!(actual.stdout, expected.stdout);
    assert_eq!(actual.stderr, expected.stderr);
    assert_eq!(actual.status.code(), expected.status.code());
}

#[test]
fn stored_custom_package_name_matches_node() {
    let helper = workspace();
    crate::helper::config::set_workspace_key(
        &helper.scopes.local_path,
        "teambit.workspace/variants",
        serde_json::json!({
            "bar/foo": { "teambit.pkg/pkg": { "packageJson": { "name": "@custom/{name}" } } }
        }),
    );
    helper.tag_without_build("", "");
    helper.create_component_bar_foo("module.exports = 'third';");
    let baseline = helper.clone_workspace();
    let expected =
        Helper::cmd_in_with(&baseline, "diff bar/foo --json", &[("BIT_NATIVE", OsStr::new("off"))]);
    let actual = helper.cmd("diff bar/foo --json");
    assert!(actual.native, "{}", actual.trace);
    assert_eq!(actual.status.code(), expected.status.code());
    assert_eq!(actual.stdout, expected.stdout);
    assert_eq!(actual.stderr, expected.stderr);
}

#[test]
fn historical_diff_selects_multiple_components() {
    let helper = workspace();
    helper.tag_without_build("", "");
    parity(&helper, "diff ** 0.0.1 0.0.2 --json");
}

#[test]
fn parent_diff_selects_multiple_components() {
    let helper = workspace();
    helper.tag_without_build("", "");
    parity(&helper, "diff ** --parent --json");
}

#[test]
fn colored_dependency_table_matches_node() {
    let helper = workspace();
    helper.run("deps set bar/foo lodash@1.0.0 --dev");
    let baseline = helper.clone_workspace();
    let expected = color_run(&baseline, true);
    let actual = color_run(&helper.scopes.local_path, false);
    assert_eq!(actual.status.code(), expected.status.code());
    assert_eq!(actual.stdout, expected.stdout);
    let stderr = String::from_utf8_lossy(&actual.stderr);
    assert!(!stderr.contains("bit-native: delegating"), "{stderr}");
    let visible = stderr
        .lines()
        .filter(|line| !line.starts_with("bit-native: "))
        .collect::<Vec<_>>()
        .join("\n");
    let expected_stderr = String::from_utf8_lossy(&expected.stderr);
    let expected_visible = expected_stderr
        .lines()
        .filter(|line| !line.starts_with("bit-native: "))
        .collect::<Vec<_>>()
        .join("\n");
    assert_eq!(visible, expected_visible);
}

#[test]
fn nested_files_and_crlf_match_node() {
    let helper = workspace();
    for (file, body) in [
        ("bar/z.js", "const z = 1;\r\n"),
        ("bar/a.js", "const a = 1;\r\n"),
        ("bar/z/deep.js", "const z = 2;\r\n"),
        ("bar/a/deep.js", "const a = 2;\r\n"),
        ("bar/a/nested/deeper.js", "const a = 3;\r\n"),
    ] {
        helper.output_file(file, body);
    }
    helper.run("add bar -i bar/foo");
    helper.run("deps set bar/foo lodash@1.0.0 --dev");
    let baseline = helper.clone_workspace();
    let expected =
        Helper::cmd_in_with(&baseline, "diff bar/foo --json", &[("BIT_NATIVE", OsStr::new("off"))]);
    let actual = helper.cmd("diff bar/foo --json");
    assert!(actual.native, "{}", actual.trace);
    assert_eq!(actual.status.code(), expected.status.code());
    assert_eq!(
        sibling_order::normalize(&actual.stdout),
        sibling_order::normalize(&expected.stdout),
    );
    assert_eq!(actual.stderr, expected.stderr);
}

#[test]
fn changed_custom_package_name_matches_node() {
    let helper = workspace();
    crate::helper::config::set_workspace_key(
        &helper.scopes.local_path,
        "teambit.workspace/variants",
        serde_json::json!({
            "bar/foo": { "teambit.pkg/pkg": { "packageJson": { "name": "@custom/{name}" } } }
        }),
    );
    let baseline = helper.clone_workspace();
    let expected =
        Helper::cmd_in_with(&baseline, "diff bar/foo --json", &[("BIT_NATIVE", OsStr::new("off"))]);
    let actual = helper.cmd("diff bar/foo --json");
    assert!(actual.native, "{}", actual.trace);
    assert_eq!(actual.status.code(), expected.status.code());
    assert_eq!(actual.stdout, expected.stdout);
    assert_eq!(actual.stderr, expected.stderr);
}

fn color_run(root: &std::path::Path, node: bool) -> std::process::Output {
    crate::helper::setup::bit_command(crate::helper::setup::shared(), root)
        .args(["diff", "bar/foo", "--table"])
        .env_remove("NO_COLOR")
        .env("FORCE_COLOR", "1")
        .env("BIT_NATIVE", if node { "off" } else { "on" })
        .output()
        .unwrap()
}

fn missing_remote_version() -> Helper {
    remote_versions(publish_remote_fixture)
}

fn remote_versions(publish: fn(&Helper)) -> Helper {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.create_component_bar_foo("module.exports = 'one';");
    helper.add_component_bar_foo();
    helper.tag_without_build("", "");
    publish(&helper);
    let first = helper.clone_workspace();
    helper.create_component_bar_foo("module.exports = 'two';");
    helper.tag_without_build("", "");
    publish(&helper);
    helper.get_cloned_workspace(&first);
    helper
}

fn remote_parity(command: &str) {
    remote_parity_with(&missing_remote_version(), command);
}

fn remote_parity_with(helper: &Helper, command: &str) {
    let baseline = helper.clone_workspace();
    let remote = helper.clone_remote_scope();
    let expected = Helper::cmd_in_with(&baseline, command, &[("BIT_NATIVE", OsStr::new("off"))]);
    helper.restore_remote_scope(&remote);
    let actual = helper.cmd(command);
    assert!(actual.native, "{}", actual.trace);
    assert!(actual.status.success(), "{}", actual.stderr);
    assert_eq!(actual.status.code(), expected.status.code());
    assert_eq!(actual.stdout, expected.stdout);
    assert_eq!(actual.stderr, expected.stderr);
    let actual_objects = super::remove::scope_objects(&helper.scopes.local_path);
    let expected_objects = super::remove::scope_objects(&baseline);
    for (name, bytes) in &expected_objects {
        assert!(actual_objects.contains_key(name), "native missing {name:?}: {}", inflate(bytes));
    }
    assert_eq!(
        actual_objects.keys().collect::<Vec<_>>(),
        expected_objects.keys().collect::<Vec<_>>(),
    );
    for (name, bytes) in actual_objects {
        let expected = &expected_objects[&name];
        if &bytes != expected {
            assert_eq!(inflate(&bytes), inflate(expected), "{name:?}");
        }
    }
    let index = bit_object_import::scope_path(&helper.scopes.local_path)
        .strip_prefix(&helper.scopes.local_path)
        .unwrap()
        .join("index.json");
    for file in
        [std::path::PathBuf::from(".bitmap"), index, "bar/foo.js".into(), "workspace.jsonc".into()]
    {
        assert_eq!(
            std::fs::read(helper.scopes.local_path.join(&file)).unwrap(),
            std::fs::read(baseline.join(&file)).unwrap(),
            "{}",
            file.display(),
        );
    }
}

#[test]
fn remote_only_versions_diff_matches_node() {
    remote_parity("diff bar/foo 0.0.1 0.0.2 --json");
}

#[test]
fn remote_version_workspace_diff_matches_node() {
    remote_parity("diff bar/foo 0.0.2 --json");
}

#[test]
fn remote_version_parent_diff_matches_node() {
    remote_parity("diff bar/foo 0.0.2 --parent --json");
}

#[test]
fn http_remote_only_versions_diff_matches_node() {
    let helper = missing_remote_version();
    let _server = http::start(&helper);
    remote_parity_with(&helper, "diff bar/foo 0.0.1 0.0.2 --json");
}

#[test]
fn headless_tagged_model_diff_matches_node() {
    use std::io::{Read, Write};
    let helper = workspace();
    let root = &helper.scopes.local_path;
    let index: serde_json::Value =
        serde_json::from_slice(&std::fs::read(root.join(".bit/index.json")).unwrap()).unwrap();
    let hash = index["components"]
        .as_array()
        .unwrap()
        .iter()
        .find(|row| row["id"]["name"] == "bar/foo")
        .unwrap()["hash"]
        .as_str()
        .unwrap();
    let path = root
        .join(".bit/objects")
        .join(&hash[..2])
        .join(&hash[2..]);
    let bytes = std::fs::read(&path).unwrap();
    let mut raw = Vec::new();
    flate2::read::ZlibDecoder::new(bytes.as_slice()).read_to_end(&mut raw).unwrap();
    let split = raw
        .iter()
        .position(|byte| *byte == 0)
        .unwrap();
    let mut model: serde_json::Value = serde_json::from_slice(&raw[split + 1..]).unwrap();
    model
        .as_object_mut()
        .unwrap()
        .remove("head");
    let body = serde_json::to_string(&model).unwrap();
    let mut encoder = flate2::write::ZlibEncoder::new(Vec::new(), flate2::Compression::default());
    encoder
        .write_all(format!("Component {hash} {}\0{body}", body.encode_utf16().count()).as_bytes())
        .unwrap();
    std::fs::write(path, encoder.finish().unwrap()).unwrap();
    let baseline = helper.clone_workspace();
    let expected =
        Helper::cmd_in_with(&baseline, "diff bar/foo --json", &[("BIT_NATIVE", OsStr::new("off"))]);
    let actual = helper.cmd("diff bar/foo --json");
    assert!(actual.native, "{}", actual.trace);
    assert_eq!(actual.status.code(), expected.status.code());
    assert_eq!(actual.stdout, expected.stdout);
    assert_eq!(actual.stderr, expected.stderr);
}

fn inflate(bytes: &[u8]) -> String {
    use std::io::Read;
    let mut out = String::new();
    flate2::read::ZlibDecoder::new(bytes).read_to_string(&mut out).unwrap();
    out
}

#[test]
fn locally_deleted_diff_matches_node() {
    let helper = missing_remote_version();
    helper.run("delete bar/foo --silent");
    let baseline = helper.clone_workspace();
    let expected =
        Helper::cmd_in_with(&baseline, "diff bar/foo --json", &[("BIT_NATIVE", OsStr::new("off"))]);
    let actual = helper.cmd("diff bar/foo --json");
    assert!(!actual.native, "{}", actual.trace);
    assert_eq!(actual.status.code(), expected.status.code());
    assert_eq!(actual.stdout, expected.stdout);
    assert_eq!(actual.stderr, expected.stderr);
}

#[test]
fn binary64_configuration_diff_matches_node() {
    let helper = workspace();
    crate::helper::config::set_workspace_key(
        &helper.scopes.local_path,
        "teambit.pkg/pkg",
        serde_json::json!({"packageJson":{"ratio":1e-7,"large":1e21,"negativeZero":-0.0,"fraction":1.0000000000000002}}),
    );
    parity(&helper, "diff bar/foo --json");
}

#[test]
fn git_embedded_scope_remote_diff_matches_node() {
    let helper = missing_remote_version();
    let root = &helper.scopes.local_path;
    std::fs::create_dir(root.join(".git")).unwrap();
    std::fs::rename(root.join(".bit"), root.join(".git/bit")).unwrap();
    remote_parity_with(&helper, "diff bar/foo 0.0.1 0.0.2 --json");
    assert!(!root.join(".bit").exists());
}
