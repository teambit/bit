//! Doctor's built-in diagnoses, table rendering and diagnostic archives.
mod proxy;
mod recovery;
use crate::helper::Helper;
use serde_json::Value;
use std::{collections::BTreeMap, ffi::OsStr, fs, io::Read, path::Path};
fn compare(helper: &Helper, oracle: &Path, command: &str, environment: &[(&str, &OsStr)]) {
    let mut node_environment = environment.to_vec();
    node_environment.push(("BIT_NATIVE", OsStr::new("off")));
    let expected = Helper::cmd_in_with(oracle, command, &node_environment);
    let actual = Helper::cmd_in_with(&helper.scopes.local_path, command, environment);
    assert!(actual.native, "{command}: {}", actual.trace);
    assert_eq!(
        actual.status.code(),
        expected.status.code(),
        "{command}: {} {}",
        actual.stderr,
        expected.stderr,
    );
    assert_eq!(actual.stdout, expected.stdout, "{command}: native stderr {}", actual.stderr);
    assert_eq!(actual.stderr, expected.stderr, "{command}");
}
#[test]
fn diagnosis_listing_matches_node_text_json_and_colors() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    let oracle = helper.clone_workspace();
    for command in ["doctor --list", "doctor --list --json", "doctor --list --include-node-modules"]
    {
        compare(&helper, &oracle, command, &[]);
        compare(
            &helper,
            &oracle,
            command,
            &[("FORCE_COLOR", OsStr::new("1")), ("CI", OsStr::new("1"))],
        );
    }
    compare(&helper, &oracle, "doctor no-such-diagnosis --json", &[]);
}
#[test]
fn git_diagnosis_matches_node_success_failure_and_treatment() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    let oracle = helper.clone_workspace();
    for command in [r#"doctor "validate git exec" --json"#, r#"doctor "validate git exec""#] {
        compare(&helper, &oracle, command, &[]);
        compare(
            &helper,
            &oracle,
            command,
            &[("BIT_CONFIG_GIT_PATH", OsStr::new("doctor-missing-git-executable"))],
        );
    }
}
#[test]
fn scope_integrity_matches_node_healthy_and_missing_head() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.create_component_bar_foo("module.exports = 'diagnostic';");
    helper.add_component_bar_foo();
    helper.tag_without_build("bar/foo", "--message diagnosis");
    let oracle = helper.clone_workspace();
    compare(&helper, &oracle, r#"doctor "validate scope objects" --json"#, &[]);
    for root in [&helper.scopes.local_path, &oracle] {
        let index: Value =
            serde_json::from_slice(&fs::read(root.join(".bit/index.json")).unwrap()).unwrap();
        let rows = index
            .as_array()
            .or_else(|| index["components"].as_array())
            .unwrap();
        let hash = rows[0]["hash"].as_str().unwrap();
        let bytes = fs::read(
            root.join(".bit/objects")
                .join(&hash[..2])
                .join(&hash[2..]),
        )
        .unwrap();
        let mut raw = Vec::new();
        flate2::read::ZlibDecoder::new(bytes.as_slice()).read_to_end(&mut raw).unwrap();
        let separator = raw
            .iter()
            .position(|byte| *byte == 0)
            .unwrap();
        let model: Value = serde_json::from_slice(&raw[separator + 1..]).unwrap();
        let head = model["head"].as_str().unwrap();
        fs::remove_file(
            root.join(".bit/objects")
                .join(&head[..2])
                .join(&head[2..]),
        )
        .unwrap();
    }
    compare(&helper, &oracle, r#"doctor "validate scope objects" --json"#, &[]);
    compare(&helper, &oracle, r#"doctor "validate scope objects""#, &[]);
}
fn entries(path: &Path) -> BTreeMap<String, Vec<u8>> {
    let mut archive = tar::Archive::new(fs::File::open(path).unwrap());
    archive
        .entries()
        .unwrap()
        .map(|entry| {
            let mut entry = entry.unwrap();
            let path = entry
                .path()
                .unwrap()
                .to_string_lossy()
                .trim_start_matches("./")
                .to_owned();
            let mut bytes = Vec::new();
            entry.read_to_end(&mut bytes).unwrap();
            (path, bytes)
        })
        .collect()
}
#[test]
fn save_and_archive_retain_canonical_entries_and_scope_exclusions() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    for name in [
        ".bit/objects/ab/payload",
        ".bit/cache/payload",
        ".bit/tmp/payload",
        "public/payload",
        "node_modules/doctor-fixture/payload",
    ] {
        let path = helper.scopes.local_path.join(name);
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(path, "fixture").unwrap();
    }
    helper.output_file("doctor-results-123.tar", "prior diagnostic");
    helper.output_file("doctor-results-456.tar.gz", "prior diagnostic");
    let oracle = helper.clone_workspace();
    for flags in
        ["--save doctor-fixture.json", "--archive doctor-fixture.json --exclude-local-scope"]
    {
        compare(&helper, &oracle, &format!(r#"doctor "validate git exec" --json {flags}"#), &[]);
        compare_archive(
            &helper.scopes.local_path.join("doctor-fixture.tar"),
            &oracle.join("doctor-fixture.tar"),
        );
        fs::remove_file(helper.scopes.local_path.join("doctor-fixture.tar")).unwrap();
        fs::remove_file(oracle.join("doctor-fixture.tar")).unwrap();
    }
}

fn compare_archive(actual: &Path, expected: &Path) {
    let actual = entries(actual);
    let expected = entries(expected);
    assert_eq!(actual.keys().collect::<Vec<_>>(), expected.keys().collect::<Vec<_>>());
    for (name, bytes) in actual {
        if name == "env-meta.json" {
            let mut actual: Value = serde_json::from_slice(&bytes).unwrap();
            let mut expected: Value = serde_json::from_slice(&expected[&name]).unwrap();
            actual["runningTimestamp"] = Value::Null;
            expected["runningTimestamp"] = Value::Null;
            assert_eq!(actual, expected);
        } else if name == ".bit/command-history" {
            assert_eq!(history(&bytes), history(&expected[&name]));
        } else if name != "debug.log" {
            assert_eq!(bytes, expected[&name], "{name}");
        }
    }
}

#[test]
fn default_diagnoses_match_node_offline_without_creating_a_fresh_index() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    let oracle = helper.clone_workspace();
    let proxy = proxy::Proxy::new();
    let certificate = proxy::certificate();
    let environment = [
        ("BVM_https_proxy", OsStr::new(&proxy.url)),
        ("NODE_EXTRA_CA_CERTS", certificate.as_os_str()),
    ];
    let before = fs::read(helper.scopes.local_path.join(".bit/index.json")).ok();
    for command in ["doctor --json", "doctor", r#"doctor "validate bit version" --json"#] {
        compare(&helper, &oracle, command, &environment);
    }
    let actual = Helper::cmd_in_with(&helper.scopes.local_path, "doctor --json", &environment);
    let result: Value = serde_json::from_str(&actual.stdout).unwrap();
    assert_eq!(
        result["examineResults"]
            .as_array()
            .unwrap()
            .len(),
        8,
        "complete offline catalog diagnosis result: {result}; status: {:?}; stderr: {}; catalog requests: {}",
        actual.status.code(),
        actual.stderr,
        proxy.requests(),
    );
    assert_eq!(fs::read(helper.scopes.local_path.join(".bit/index.json")).ok(), before);
    assert_eq!(fs::read(oracle.join(".bit/index.json")).ok(), before);
    assert_eq!(proxy.requests(), 7);
    assert_eq!(proxy.completed(), 7);
}

fn history(bytes: &[u8]) -> Vec<&str> {
    std::str::from_utf8(bytes)
        .unwrap()
        .lines()
        .map(|line| {
            let mut fields = line.splitn(3, ' ');
            chrono::DateTime::parse_from_rfc3339(fields.next().unwrap()).unwrap();
            fields
                .next()
                .unwrap()
                .parse::<u32>()
                .unwrap();
            fields.next().unwrap()
        })
        .collect()
}

#[test]
fn default_save_filename_matches_its_metadata_timestamp_and_canonical_contents() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    let oracle = helper.clone_workspace();
    let command = r#"doctor "validate git exec" --json --save"#;
    let actual = helper.native_run(command);
    let expected = Helper::cmd_in_with(&oracle, command, &[("BIT_NATIVE", OsStr::new("off"))]);
    assert_eq!(actual.status.code(), expected.status.code());
    assert_eq!(actual.stderr, expected.stderr);
    let actual: Value = serde_json::from_str(&actual.stdout).unwrap();
    let expected: Value = serde_json::from_str(&expected.stdout).unwrap();
    assert_eq!(actual["examineResult"], expected["examineResult"]);
    let actual_path = default_archive(&helper.scopes.local_path, &actual);
    let expected_path = default_archive(&oracle, &expected);
    compare_archive(&actual_path, &expected_path);
}
fn default_archive(root: &Path, result: &Value) -> std::path::PathBuf {
    let filename = result["savedFilePath"].as_str().unwrap();
    let timestamp = filename
        .strip_prefix("doctor-results-")
        .unwrap()
        .strip_suffix(".tar")
        .unwrap()
        .parse::<i64>()
        .unwrap();
    let path = root.join(filename);
    let archive = entries(&path);
    let metadata: Value = serde_json::from_slice(&archive["env-meta.json"]).unwrap();
    assert_eq!(metadata["runningTimestamp"], timestamp);
    path
}

#[test]
fn git_executable_success_does_not_require_version_output() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    let oracle = helper.clone_workspace();
    let program =
        helper.scopes.e2e_dir.join(if cfg!(windows) { "silent-git.cmd" } else { "silent-git" });
    fs::write(&program, if cfg!(windows) { "@exit /b 0\r\n" } else { "#!/bin/sh\nexit 0\n" })
        .unwrap();
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(&program, fs::Permissions::from_mode(0o755)).unwrap();
    }
    compare(
        &helper,
        &oracle,
        r#"doctor "validate git exec" --json"#,
        &[("BIT_CONFIG_GIT_PATH", program.as_os_str())],
    );
}

#[test]
fn colored_unknown_diagnoses_preserve_the_published_error_stack_before_effects() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    let oracle = helper.clone_workspace();
    let bitmap = fs::read(helper.scopes.local_path.join(".bitmap")).unwrap();
    let command = "doctor no-such-diagnosis --json";
    let environment = [
        ("FORCE_COLOR", OsStr::new("1")),
        ("CI", OsStr::new("1")),
        ("BIT_NATIVE_QUIET", OsStr::new("1")),
    ];
    let actual = Helper::cmd_in_with(&helper.scopes.local_path, command, &environment);
    let mut environment = environment.to_vec();
    environment.push(("BIT_NATIVE", OsStr::new("off")));
    let expected = Helper::cmd_in_with(&oracle, command, &environment);
    assert!(!actual.native, "{}", actual.trace);
    assert_eq!(actual.status.code(), expected.status.code());
    assert_eq!(actual.stdout, expected.stdout);
    assert_eq!(actual.stderr, expected.stderr);
    assert!(actual.stderr.contains("DiagnosisNotFound"));
    assert_eq!(fs::read(helper.scopes.local_path.join(".bitmap")).unwrap(), bitmap);
    assert_eq!(fs::read(oracle.join(".bitmap")).unwrap(), bitmap);
}

#[test]
fn failed_builtin_checks_preserve_default_json_quietness_and_text_errors() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    let oracle = helper.clone_workspace();
    let proxy = proxy::Proxy::empty();
    let certificate = proxy::certificate();
    let environment = [
        ("BVM_https_proxy", OsStr::new(&proxy.url)),
        ("NODE_EXTRA_CA_CERTS", certificate.as_os_str()),
    ];
    compare(&helper, &oracle, "doctor --json", &environment);
    compare(&helper, &oracle, "doctor", &environment);
    assert_eq!(proxy.requests(), 4);
}

#[test]
fn nested_directory_diagnoses_record_history_at_the_workspace_root() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    let oracle = helper.clone_workspace();
    let nested = "components/nested";
    fs::create_dir_all(helper.scopes.local_path.join(nested)).unwrap();
    fs::create_dir_all(oracle.join(nested)).unwrap();
    for command in ["doctor --list", r#"doctor "validate git exec" --json"#] {
        let actual = Helper::cmd_in_with(&helper.scopes.local_path.join(nested), command, &[]);
        let expected = Helper::cmd_in_with(
            &oracle.join(nested),
            command,
            &[("BIT_NATIVE", OsStr::new("off"))],
        );
        assert!(actual.native, "{}", actual.trace);
        assert_eq!(actual.status.code(), expected.status.code());
        assert_eq!(actual.stdout, expected.stdout);
        assert_eq!(actual.stderr, expected.stderr);
        assert_eq!(
            history(&fs::read(helper.scopes.local_path.join(".bit/command-history")).unwrap()),
            history(&fs::read(oracle.join(".bit/command-history")).unwrap()),
        );
        assert!(
            !helper.scopes.local_path
                .join(nested)
                .join(".bit")
                .exists(),
        );
        assert!(
            !oracle
                .join(nested)
                .join(".bit")
                .exists(),
        );
    }
}
