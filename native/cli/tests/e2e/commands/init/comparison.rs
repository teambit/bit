//! Only fresh local scope identifiers and wall-clock backup filenames differ.
mod history;

use std::{
    collections::{BTreeMap, btree_map::Entry},
    fs,
    path::Path,
};

pub(super) fn tree(actual: &Path, expected: &Path, command: &str, rebuilt_index: bool) {
    let actual = inventory(actual, rebuilt_index);
    let expected = inventory(expected, rebuilt_index);
    assert_eq!(actual.keys().collect::<Vec<_>>(), expected.keys().collect::<Vec<_>>(), "{command}");
    for (path, expected) in expected {
        assert!(
            actual[&path] == expected,
            "{path}: actual {:?}, expected {:?}",
            String::from_utf8_lossy(&actual[&path]),
            String::from_utf8_lossy(&expected),
        );
    }
}
fn inventory(root: &Path, rebuilt_index: bool) -> BTreeMap<String, Vec<u8>> {
    let mut result = BTreeMap::new();
    let histories = history::Histories::read(root);
    visit(root, root, &mut result, rebuilt_index, &histories);
    result
}
fn visit(
    root: &Path,
    directory: &Path,
    result: &mut BTreeMap<String, Vec<u8>>,
    rebuilt_index: bool,
    histories: &history::Histories,
) {
    for entry in fs::read_dir(directory).unwrap().map(Result::unwrap) {
        let path = entry.path();
        let relative = path
            .strip_prefix(root)
            .unwrap()
            .to_string_lossy()
            .replace('\\', "/");
        let key = histories.path(&relative);
        permissions(&entry, &key, result);
        if entry.file_type().unwrap().is_symlink() {
            record(
                result,
                format!("{key}:symlink"),
                fs::read_link(&path)
                    .unwrap()
                    .to_string_lossy()
                    .into_owned()
                    .into_bytes(),
            );
        } else if entry.file_type().unwrap().is_dir() {
            record(result, format!("{key}/"), Vec::new());
            visit(root, &path, result, rebuilt_index, histories);
        } else {
            let bytes = fs::read(path).unwrap();
            let mut bytes = histories
                .metadata(&relative, &bytes)
                .unwrap_or_else(|| normalize(&relative, bytes));
            if rebuilt_index && relative == ".bit/index.json" {
                bytes = index(&bytes);
            }
            record(result, key, bytes);
        }
    }
}
fn normalize(path: &str, mut bytes: Vec<u8>) -> Vec<u8> {
    if path.ends_with("scope.json") {
        let value: serde_json::Value = serde_json::from_slice(&bytes).unwrap();
        let name = value["name"].as_str().unwrap();
        if let Some((_, suffix)) = name.rsplit_once("-local-") {
            assert_eq!(suffix.len(), 8);
            assert!(suffix.bytes().all(|byte| byte.is_ascii_hexdigit()));
            bytes = String::from_utf8(bytes)
                .unwrap()
                .replace(name, "LOCAL_SCOPE")
                .into_bytes();
        }
    }

    bytes
}

fn validate_date(value: &str) {
    let parts: Vec<_> = value
        .split('-')
        .map(|part| part.parse::<u32>().unwrap())
        .collect();
    assert_eq!(parts.len(), 6);
    assert!((1..=12).contains(&parts[1]) && (1..=31).contains(&parts[2]));
    assert!(parts[3] < 24 && parts[4] < 60 && parts[5] < 60);
}

#[cfg(unix)]
pub(super) fn copy_directory_modes(source: &Path, target: &Path) {
    for entry in fs::read_dir(source).unwrap().map(Result::unwrap) {
        if entry.file_type().unwrap().is_dir() {
            copy_directory_modes(&entry.path(), &target.join(entry.file_name()));
        }
    }
    fs::set_permissions(target, fs::metadata(source).unwrap().permissions()).unwrap();
}

#[cfg(not(unix))]
pub(super) fn copy_directory_modes(_source: &Path, _target: &Path) {}

// Only the multi-component repair oracle opts in: published Repository.list pushes
// asynchronously completed ModelComponents. The pinned Node-only proof under
// scripts/rust reproduces both orders for identical objects. Keep raw formatting,
// every complete row and all lane ordering exact; only component row order varies.
fn index(bytes: &[u8]) -> Vec<u8> {
    let mut value: serde_json::Value = serde_json::from_slice(bytes).unwrap();
    assert_eq!(bytes, format!("{}\n", serde_json::to_string_pretty(&value).unwrap()).into_bytes());
    value["components"]
        .as_array_mut()
        .unwrap()
        .sort_by_key(|row| row["hash"].as_str().unwrap().to_owned());
    format!("{}\n", serde_json::to_string_pretty(&value).unwrap()).into_bytes()
}

#[cfg(unix)]
fn permissions(entry: &fs::DirEntry, key: &str, result: &mut BTreeMap<String, Vec<u8>>) {
    use std::os::unix::fs::PermissionsExt;
    let mode = entry
        .metadata()
        .unwrap()
        .permissions()
        .mode()
        & 0o7777;
    record(result, format!("{key}:permissions"), mode.to_string().into_bytes());
}

#[cfg(not(unix))]
fn permissions(_entry: &fs::DirEntry, _key: &str, _result: &mut BTreeMap<String, Vec<u8>>) {}

fn record(result: &mut BTreeMap<String, Vec<u8>>, key: String, bytes: Vec<u8>) {
    match result.entry(key) {
        Entry::Vacant(entry) => {
            entry.insert(bytes);
        }
        Entry::Occupied(entry) => panic!("duplicate init inventory key: {}", entry.key()),
    }
}
