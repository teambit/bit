use crate::helper::{Helper, config};
use serde_json::Value;
use std::{collections::BTreeMap, ffi::OsStr, fs, io::Read, path::Path};

pub(super) fn workspace() -> Helper {
    let helper = Helper::new();
    helper.re_init_workspace();
    helper.output_file("comp1/index.js", "console.log('base');\n\n");
    helper.run("add comp1");
    helper.tag_without_build("comp1", "--message initial");
    helper
}
pub(super) fn command(helper: &Helper, oracle: &Path, command: &str) {
    let actual = helper.native_run(command);
    let expected = node(oracle, command);
    assert!(actual.native, "{command}: {}", actual.trace);
    assert_eq!(
        actual.status.code(),
        expected.status.code(),
        "{command}: {} {}",
        actual.stderr,
        expected.stderr,
    );
    assert_eq!(actual.stdout, expected.stdout, "{command}");
    assert_eq!(actual.stderr, expected.stderr, "{command}");
    assert_eq!(history(&helper.scopes.local_path), history(oracle));
    assert_eq!(
        config::read_jsonc(&helper.scopes.local_path.join(".bitmap")),
        config::read_jsonc(&oracle.join(".bitmap")),
    );
}
pub(super) fn node(root: &Path, command: &str) -> crate::helper::Run {
    Helper::cmd_in_with(root, command, &[("BIT_NATIVE", OsStr::new("off"))])
}
pub(super) fn write_both(helper: &Helper, oracle: &Path, path: &str, contents: &str) {
    for root in [&helper.scopes.local_path, oracle] {
        let path = root.join(path);
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(path, contents).unwrap();
    }
}
pub(super) fn compare_stashes(root: &Path, oracle: &Path) {
    let actual = stash_data(root);
    let expected = stash_data(oracle);
    assert_eq!(actual.keys().collect::<Vec<_>>(), expected.keys().collect::<Vec<_>>());
    for (name, mut actual) in actual {
        let mut expected = expected[&name].clone();
        compare_versions(root, oracle, &mut actual, &mut expected);
        assert_eq!(actual, expected, "{name}");
    }
}
fn stash_data(root: &Path) -> BTreeMap<String, Value> {
    let directory = bit_object_import::scope_path(root).join("stash");
    if !directory.exists() {
        return BTreeMap::new();
    }
    fs::read_dir(directory)
        .unwrap()
        .map(|entry| {
            let path = entry.unwrap().path();
            let bytes = fs::read(&path).unwrap();
            let value: Value = serde_json::from_slice(&bytes).unwrap();
            let mut rendered = Vec::new();
            use serde::Serialize;
            value
                .serialize(&mut serde_json::Serializer::with_formatter(
                    &mut rendered,
                    serde_json::ser::PrettyFormatter::with_indent(b"    "),
                ))
                .unwrap();
            assert_eq!(bytes, rendered, "stash metadata indentation/trailing newline");
            (
                path.file_name()
                    .unwrap()
                    .to_str()
                    .unwrap()
                    .to_owned(),
                value,
            )
        })
        .collect()
}
fn compare_versions(root: &Path, oracle: &Path, actual: &mut Value, expected: &mut Value) {
    let actual = actual["stashCompsData"].as_array_mut().unwrap();
    let expected = expected["stashCompsData"].as_array_mut().unwrap();
    assert_eq!(actual.len(), expected.len());
    for (actual, expected) in actual.iter_mut().zip(expected) {
        let mut actual_version = object(root, actual["hash"].as_str().unwrap(), "Version");
        let mut expected_version = object(oracle, expected["hash"].as_str().unwrap(), "Version");
        assert_eq!(
            actual_version["parents"], expected_version["parents"],
            "stash component IDs: native {}, Node {}",
            actual["id"], expected["id"],
        );
        compare_sources(root, oracle, &actual_version, &expected_version);
        // Detached Versions can acquire a fresh log timestamp independently in each command.
        actual_version["log"]
            .as_object_mut()
            .unwrap()
            .remove("date");
        expected_version["log"]
            .as_object_mut()
            .unwrap()
            .remove("date");
        assert_eq!(actual_version, expected_version, "detached stash Version");
        actual["hash"] = Value::String("DETACHED_VERSION".into());
        expected["hash"] = Value::String("DETACHED_VERSION".into());
    }
}
fn compare_sources(root: &Path, oracle: &Path, actual: &Value, expected: &Value) {
    assert_eq!(actual["files"], expected["files"]);
    for row in actual["files"].as_array().unwrap() {
        let hash = row["file"].as_str().unwrap();
        assert_eq!(raw_object(root, hash, "Source"), raw_object(oracle, hash, "Source"));
    }
}
fn object(root: &Path, hash: &str, kind: &str) -> Value {
    serde_json::from_slice(&raw_object(root, hash, kind)).unwrap()
}
fn raw_object(root: &Path, hash: &str, kind: &str) -> Vec<u8> {
    let path = bit_object_import::scope_path(root)
        .join("objects")
        .join(&hash[..2])
        .join(&hash[2..]);
    let packed = fs::read(path).unwrap();
    let mut raw = Vec::new();
    flate2::read::ZlibDecoder::new(packed.as_slice()).read_to_end(&mut raw).unwrap();
    let separator = raw
        .iter()
        .position(|byte| *byte == 0)
        .unwrap();
    assert!(std::str::from_utf8(&raw[..separator]).unwrap().starts_with(kind));
    raw[separator + 1..].to_vec()
}
pub(super) fn history(root: &Path) -> Vec<String> {
    fs::read_to_string(bit_object_import::scope_path(root).join("command-history"))
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
            fields.next().unwrap().to_owned()
        })
        .collect()
}
pub(super) fn controls(root: &Path) -> BTreeMap<String, Vec<u8>> {
    let scope = bit_object_import::scope_path(root);
    let mut result = BTreeMap::new();
    for name in ["index.json", "remote-refs", "scope.json", "staged-snaps", "staged-config"] {
        let path = scope.join(name);
        if path.is_file() {
            result.insert(name.into(), fs::read(path).unwrap());
        }
    }
    let index = scope.join("index.json");
    if index.is_file() {
        let index: Value = serde_json::from_slice(&fs::read(index).unwrap()).unwrap();
        for row in index["components"].as_array().unwrap() {
            let hash = row["hash"].as_str().unwrap();
            let path = scope
                .join("objects")
                .join(&hash[..2])
                .join(&hash[2..]);
            result.insert(format!("model/{hash}"), fs::read(path).unwrap());
        }
    }
    result
}
