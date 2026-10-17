//! Complete `ConfigCmd` sequences retain store bytes, origin precedence and rendering.
use crate::helper::{Helper, setup};
use std::{ffi::OsStr, fs, path::Path};

fn compare(helper: &Helper, oracle: &Path, command: &str, mode: &[(&str, &OsStr)]) {
    let actual_globals = helper.scopes.e2e_dir.join("native-globals");
    let expected_globals = helper.scopes.e2e_dir.join("node-globals");
    let mut actual_env = mode.to_vec();
    actual_env.push(("BIT_GLOBALS_DIR", actual_globals.as_os_str()));
    let mut expected_env = mode.to_vec();
    expected_env.push(("BIT_GLOBALS_DIR", expected_globals.as_os_str()));
    expected_env.push(("BIT_NATIVE", OsStr::new("off")));
    let expected = Helper::cmd_in_with(oracle, command, &expected_env);
    let actual = Helper::cmd_in_with(&helper.scopes.local_path, command, &actual_env);
    assert!(actual.native, "{command}: {}", actual.trace);
    assert_eq!(
        actual.status.code(),
        expected.status.code(),
        "{command}: {} {}",
        expected.stdout,
        expected.stderr,
    );
    assert_eq!(actual.stdout, expected.stdout, "{command}");
    assert_eq!(actual.stderr, expected.stderr, "{command}");
    compare_files(helper, oracle, command, &actual_globals, &expected_globals);
    assert_eq!(history(&helper.scopes.local_path), history(oracle), "{command}");
}

fn compare_files(helper: &Helper, oracle: &Path, command: &str, actual: &Path, expected: &Path) {
    for name in [".bit/scope.json", "workspace.jsonc"] {
        assert_eq!(
            fs::read(helper.scopes.local_path.join(name)).unwrap(),
            fs::read(oracle.join(name)).unwrap(),
            "{command}: {name}",
        );
    }
    assert_eq!(
        fs::read(actual.join("config/config.json")).unwrap(),
        fs::read(expected.join("config/config.json")).unwrap(),
        "{command}",
    );
}

fn history(root: &Path) -> Option<Vec<String>> {
    let bytes = fs::read(root.join(".bit/command-history")).ok()?;
    let text = String::from_utf8(bytes).unwrap();
    Some(
        text.split_inclusive('\n')
            .map(|line| {
                let mut fields = line.splitn(3, ' ');
                let timestamp = fields.next().unwrap();
                assert_eq!(timestamp.len(), 24, "{line}");
                assert!(timestamp.ends_with('Z'), "{line}");
                assert!(
                    fields
                        .next()
                        .unwrap()
                        .parse::<u32>()
                        .is_ok(),
                    "{line}",
                );
                fields.next().unwrap().to_owned()
            })
            .collect(),
    )
}

fn sequence(mode: &[(&str, &OsStr)]) {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    for name in ["native-globals", "node-globals"] {
        setup::copy_dir(&setup::shared().root.join("globals"), &helper.scopes.e2e_dir.join(name));
    }
    let oracle = helper.clone_workspace();
    for command in [
        "config",
        "config get fixture.missing",
        "config set fixture.value global",
        "config set fixture.value scope --local",
        "config set fixture.value workspace --local-track",
        "config get fixture.value",
        "config list --json",
        "config list --detailed --json",
        "config list --origin workspace",
        "config list --detailed",
        "config set fixture.tail retained",
        "config del fixture.value",
        "config get fixture.value",
        "config del fixture.value --origin workspace",
        "config get fixture.value",
        "config del fixture.value --origin scope",
        "config get fixture.value",
        "config del missing.key",
    ] {
        compare(&helper, &oracle, command, mode);
    }
}

#[test]
fn config_origins_and_mutations_match_node() {
    sequence(&[]);
}

#[test]
fn config_colors_and_ci_match_node() {
    sequence(&[
        ("FORCE_COLOR", OsStr::new("1")),
        ("CI", OsStr::new("1")),
        ("NODE_NO_WARNINGS", OsStr::new("1")),
    ]);
}

#[test]
fn config_environment_override_is_omitted_from_lists_like_node() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    for name in ["native-globals", "node-globals"] {
        setup::copy_dir(&setup::shared().root.join("globals"), &helper.scopes.e2e_dir.join(name));
    }
    let oracle = helper.clone_workspace();
    let mode = [("BIT_CONFIG_FIXTURE_VALUE", OsStr::new("environment"))];
    for command in ["config set fixture.value stored", "config get fixture.value", "config list -j"]
    {
        compare(&helper, &oracle, command, &mode);
    }
}

#[test]
fn config_typed_store_values_retain_released_get_and_list_quirks() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    let values = serde_json::json!({"analytics_reporting":"false","error_reporting":"false",
        "number":12,"zero":0,"boolean":true,"false":false,"null":null,
        "array":["a",null,"b"],"object":{"key":"value"}});
    for name in ["native-globals", "node-globals"] {
        let path = helper.scopes.e2e_dir.join(name).join("config");
        fs::create_dir_all(&path).unwrap();
        fs::write(path.join("config.json"), values.to_string()).unwrap();
    }
    let oracle = helper.clone_workspace();
    for command in [
        "config get number",
        "config get zero",
        "config get boolean",
        "config get false",
        "config get null",
        "config get array",
        "config get object",
        "config list",
        "config list --json",
    ] {
        compare(&helper, &oracle, command, &[]);
    }
}

#[test]
fn inherited_configuration_keys_and_explicit_constructor_values_match_node() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    for name in ["native-globals", "node-globals"] {
        setup::copy_dir(&setup::shared().root.join("globals"), &helper.scopes.e2e_dir.join(name));
    }
    let oracle = helper.clone_workspace();
    for command in [
        "config get constructor",
        "config get __proto__",
        "config get toString",
        "config set constructor explicit",
        "config get constructor",
        "config list --json",
        "config del constructor",
        "config get constructor",
    ] {
        compare(&helper, &oracle, command, &[]);
    }
    prototype_mutation(&helper, &oracle);
    assert_eq!(history(&helper.scopes.local_path), history(&oracle));
}

fn prototype_mutation(helper: &Helper, oracle: &Path) {
    let actual_globals = helper.scopes.e2e_dir.join("native-globals");
    let before = fs::read(actual_globals.join("config/config.json")).unwrap();
    let actual = Helper::cmd_in_with(
        &helper.scopes.local_path,
        "config set __proto__ value",
        &[("BIT_GLOBALS_DIR", actual_globals.as_os_str())],
    );
    let expected_globals = helper.scopes.e2e_dir.join("node-globals");
    let expected = Helper::cmd_in_with(
        oracle,
        "config set __proto__ value",
        &[("BIT_GLOBALS_DIR", expected_globals.as_os_str()), ("BIT_NATIVE", OsStr::new("off"))],
    );
    assert!(!actual.native, "{}", actual.trace);
    assert_eq!(actual.status.code(), expected.status.code());
    assert_eq!(actual.stdout, expected.stdout);
    assert_eq!(actual.stderr, expected.stderr);
    assert_eq!(fs::read(actual_globals.join("config/config.json")).unwrap(), before);
    assert_eq!(
        fs::read(actual_globals.join("config/config.json")).unwrap(),
        fs::read(expected_globals.join("config/config.json")).unwrap(),
    );
}
