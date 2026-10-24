use crate::helper::config;
use serde_json::Value;
use std::{fs, io::Read, path::Path};

pub(in crate::harmony) fn controls(root: &Path, oracle: &Path) {
    objects(&root.join(".bit"), &oracle.join(".bit"));
    last_export(root, oracle);
    assert_eq!(
        config::read_jsonc(&root.join(".bitmap")),
        config::read_jsonc(&oracle.join(".bitmap")),
    );
    for name in ["staged-snaps", "staged-config/main.json", "last-merged", "index.json"] {
        assert_eq!(
            fs::read(root.join(".bit").join(name)).ok(),
            fs::read(oracle.join(".bit").join(name)).ok(),
            "{name}",
        );
    }
}

pub(in crate::harmony) fn requests(rows: &[Value], retry: bool) {
    let uploads: Vec<_> = rows
        .iter()
        .filter(|row| row.get("order").is_some())
        .collect();
    assert_eq!(uploads.len(), if retry { 4 } else { 2 }, "{rows:?}");
    for row in &uploads {
        assert_eq!(row["headers"]["authorization"], "Bearer fixture-token");
        assert_eq!(row["headers"]["x-custom-origin"], "fixture-hub");
        assert_eq!(row["headers"]["x-client-version"], "2.2.94");
        assert!(row["headers"].get("x-request-scope").is_none());
        assert_eq!(row["headers"]["x-objects-hash"], row["hash"]);
        let id = row["headers"]["x-request-id"].as_str().unwrap();
        assert_eq!(id.len(), 36);
        assert_eq!(id.as_bytes()[14], b'4');
    }
    for row in uploads.iter().skip(1) {
        assert_eq!(uploads[0]["order"], row["order"]);
    }
    if retry {
        for pair in uploads.chunks_exact(2) {
            assert_eq!(pair[0]["headers"]["x-request-id"], pair[1]["headers"]["x-request-id"]);
            assert_eq!(pair[0]["hash"], pair[1]["hash"]);
        }
    }
}

pub(in crate::harmony) fn objects(root: &Path, oracle: &Path) {
    assert_eq!(fs::read(root.join("index.json")).ok(), fs::read(oracle.join("index.json")).ok());
    compare_inventory(root, &inventory(root), &inventory(oracle));
}

/// Node-only repeats prove remote parent-history and component-index insertion races.
/// Normalize only those row orders, preserving each full row and exact local indexes.
pub(in crate::harmony) fn remote_objects(root: &Path, oracle: &Path) {
    assert_eq!(remote_index(root), remote_index(oracle));
    let remote_inventory = |scope| {
        let mut rows = inventory(scope);
        for (_, bytes) in &mut rows {
            normalize_history(bytes);
        }
        rows
    };
    compare_inventory(root, &remote_inventory(root), &remote_inventory(oracle));
}

fn compare_inventory(root: &Path, actual: &[(String, Vec<u8>)], expected: &[(String, Vec<u8>)]) {
    assert_eq!(
        actual
            .iter()
            .map(|row| &row.0)
            .collect::<Vec<_>>(),
        expected
            .iter()
            .map(|row| &row.0)
            .collect::<Vec<_>>(),
    );
    for ((hash, actual), (_, expected)) in actual.iter().zip(expected) {
        assert!(
            actual == expected,
            "{hash} at {}\nactual: {:?}\nexpected: {:?}",
            root.display(),
            String::from_utf8_lossy(actual),
            String::from_utf8_lossy(expected),
        );
    }
}
fn inventory(root: &Path) -> Vec<(String, Vec<u8>)> {
    let mut result = Vec::new();
    for prefix in fs::read_dir(root.join("objects")).unwrap().flatten() {
        if prefix
            .file_name()
            .to_string_lossy()
            .len()
            != 2
        {
            continue;
        }
        for file in fs::read_dir(prefix.path()).unwrap().flatten() {
            if !file.file_type().unwrap().is_file() {
                continue;
            }
            result.push((
                format!(
                    "{}{}",
                    prefix.file_name().to_string_lossy(),
                    file.file_name().to_string_lossy(),
                ),
                object(&file.path()),
            ));
        }
    }
    result.sort();
    result
}
fn normalize(bytes: &mut Vec<u8>) {
    let Some(boundary) = bytes.iter().position(|byte| *byte == 0) else {
        return;
    };
    let component = bytes.starts_with(b"Component ");
    let metadata = bytes.starts_with(b"ExportMetadata ");
    if !component && !metadata {
        return;
    }
    let mut value: Value = serde_json::from_slice(&bytes[boundary + 1..]).unwrap();
    if component {
        model_dates(&mut value);
    } else {
        value
            .as_object_mut()
            .unwrap()
            .remove("exportDate");
    }
    bytes.truncate(boundary + 1);
    bytes.extend(value.to_string().as_bytes());
}

pub(in crate::harmony) fn runs(
    actual: &crate::helper::Run,
    expected: &crate::helper::Run,
    requests: &[Value],
    native: bool,
) {
    assert_eq!(actual.native, native, "{} {}", actual.trace, actual.stderr);
    assert_eq!(
        actual.status.code(),
        expected.status.code(),
        "Node: {} {}\nRust: {} {}\nrequests:{:?}",
        expected.stdout,
        expected.stderr,
        actual.stdout,
        actual.stderr,
        requests,
    );
    assert_eq!(actual.stdout, expected.stdout, "{}", actual.trace);
    assert_eq!(actual.stderr, expected.stderr);
}

fn object(path: &Path) -> Vec<u8> {
    let mut bytes = Vec::new();
    flate2::read::ZlibDecoder::new(fs::File::open(path).unwrap()).read_to_end(&mut bytes).unwrap();
    normalize(&mut bytes);
    bytes
}

fn model_dates(value: &mut Value) {
    for field in ["remotes", "scopeList", "scopesList"] {
        if let Some(rows) = value.get_mut(field).and_then(Value::as_array_mut) {
            for row in rows {
                row.as_object_mut()
                    .unwrap()
                    .remove("date");
            }
        }
    }
}

/// Published CI additionally emits its JavaScript implementation stack; primary error stays exact.
pub(in crate::harmony) fn ci_failure(actual: &crate::helper::Run, expected: &crate::helper::Run) {
    assert!(actual.native, "{}", actual.trace);
    assert_eq!(actual.status.code(), expected.status.code());
    assert_eq!(actual.stdout, expected.stdout);
    assert!(actual.stderr.contains("fixture persistence failed"), "{}", actual.stderr);
    assert!(
        expected.stderr.starts_with(&actual.stderr),
        "Node:{}\nRust:{}",
        expected.stderr,
        actual.stderr,
    );
}

fn last_export(root: &Path, oracle: &Path) {
    let actual = root.join(".bit/last-export.json");
    let expected = oracle.join(".bit/last-export.json");
    if actual.is_dir() || expected.is_dir() {
        assert!(actual.is_dir() && expected.is_dir());
        return;
    }
    assert_eq!(last_export_bytes(&actual), last_export_bytes(&expected));
}
fn last_export_bytes(path: &Path) -> Option<String> {
    let text = match fs::read_to_string(path) {
        Ok(text) => text,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return None,
        Err(error) => panic!("{}: {error}", path.display()),
    };
    let json: Value = serde_json::from_str(&text).unwrap();
    let timestamp = json["timestamp"].as_str().unwrap();
    assert!(timestamp.ends_with('Z') && timestamp.contains('T'));
    Some(text.replace(&format!(r#""{timestamp}""#), r#""TIMESTAMP""#))
}

pub(in crate::harmony) fn direct_requests(rows: &[Value], scope: &str) {
    let uploads: Vec<_> = rows
        .iter()
        .filter(|row| row.get("push").is_some())
        .collect();
    assert_eq!(uploads.len(), 2, "{rows:?}");
    for upload in &uploads {
        assert_eq!(upload["push"], scope);
        assert_eq!(upload["headers"]["authorization"], "Bearer fixture-token");
        assert_eq!(upload["headers"]["x-client-version"], "2.2.94");
    }
    assert_eq!(uploads[0]["order"], uploads[1]["order"]);
    let routes: Vec<_> = rows
        .iter()
        .filter_map(|row| row["route"].as_str())
        .collect();
    let endpoint = format!("/{scope}/api/scope/put");
    assert_eq!(routes, [endpoint.as_str(), endpoint.as_str()]);
}

pub(in crate::harmony) fn protocol(rows: &[Value], mode: &str, scope: &str) {
    if mode.starts_with("direct") {
        direct_requests(rows, scope);
    } else if mode == "mixed" {
        assert!(
            rows.iter()
                .all(|row| row.get("order").is_none()),
        );
    } else {
        requests(rows, mode == "retry");
    }
}

fn normalize_history(bytes: &mut Vec<u8>) {
    if !bytes.starts_with(b"VersionHistory ") {
        return;
    }
    let boundary = bytes
        .iter()
        .position(|byte| *byte == 0)
        .unwrap();
    let mut value: Value = serde_json::from_slice(&bytes[boundary + 1..]).unwrap();
    value["versions"]
        .as_array_mut()
        .unwrap()
        .sort_by(|left, right| {
            left["hash"]
                .as_str()
                .unwrap()
                .cmp(right["hash"].as_str().unwrap())
        });
    bytes.truncate(boundary + 1);
    bytes.extend(value.to_string().as_bytes());
}

fn remote_index(scope: &Path) -> Option<String> {
    let path = scope.join("index.json");
    let text = match fs::read_to_string(&path) {
        Ok(text) => text,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return None,
        Err(error) => panic!("{}: {error}", path.display()),
    };
    let mut value: Value = serde_json::from_str(&text).unwrap();
    // Validate the original layout so reordering never hides formatting/key-order differences.
    assert_eq!(
        text.strip_suffix('\n').unwrap_or(&text),
        serde_json::to_string_pretty(&value).unwrap(),
    );
    value["components"]
        .as_array_mut()
        .unwrap()
        .sort_by_key(Value::to_string);
    let mut normalized = serde_json::to_string_pretty(&value).unwrap();
    if text.ends_with('\n') {
        normalized.push('\n');
    }
    Some(normalized)
}
