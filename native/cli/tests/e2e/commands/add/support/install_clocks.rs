//! Opt-in exact-token projection for pnpm's independently generated installation clocks.
use serde_json::Value;
use std::collections::BTreeMap;
pub(super) fn project(
    files: &mut BTreeMap<String, Vec<u8>>,
    baseline: Option<&[u8]>,
    started: i64,
    ended: i64,
) {
    let modules = files.get_mut("node_modules/.modules.yaml").expect("pnpm modules manifest");
    let value: Value = serde_json::from_slice(modules).expect("qualified JSON modules manifest");
    assert_eq!(value["layoutVersion"], 5);
    assert_eq!(value["nodeLinker"], "isolated");
    assert!(
        value["packageManager"]
            .as_str()
            .is_some_and(|value| value.starts_with("pnpm@")),
    );
    assert!(value.get("injectedDeps").is_none_or(Value::is_object));
    assert!(value["included"].is_object());
    let date = value["prunedAt"].as_str().expect("prunedAt string");
    let parsed = chrono::DateTime::parse_from_rfc2822(date).expect("prunedAt canonical date");
    assert_eq!(parsed.format("%a, %d %b %Y %H:%M:%S GMT").to_string(), date);
    let previous: Option<Value> = baseline.map(|bytes| serde_json::from_slice(bytes).unwrap());
    if previous
        .as_ref()
        .map(|old| &old["prunedAt"])
        != Some(&value["prunedAt"])
    {
        window(parsed.timestamp_millis(), started.div_euclid(1000) * 1000, ended);
    }
    replace(modules, "prunedAt", &value["prunedAt"], r#""<prunedAt>""#);
    let state =
        files.get_mut("node_modules/.pnpm-workspace-state-v1.json").expect("pnpm workspace state");
    let value: Value = serde_json::from_slice(state).expect("workspace state JSON");
    assert!(value["projects"].is_object() && value["pnpmfiles"].is_array());
    assert_eq!(value["settings"]["nodeLinker"], "isolated");
    let timestamp = value["lastValidatedTimestamp"].as_i64().expect("validation clock integer");
    window(timestamp, started, ended);
    replace(state, "lastValidatedTimestamp", &value["lastValidatedTimestamp"], "0");
    validation_clocks(state, &value["validation"], started, ended);
}
fn window(timestamp: i64, started: i64, ended: i64) {
    assert!(
        started <= timestamp && timestamp <= ended,
        "pnpm clock outside actual command window: {timestamp} not in {started}..={ended}",
    );
}
fn replace(bytes: &mut Vec<u8>, key: &str, value: &Value, replacement: &str) {
    let text = std::str::from_utf8(bytes).expect("metadata UTF-8");
    let prefix = format!("\n  \"{key}\": ");
    let matches = text.match_indices(&prefix).collect::<Vec<_>>();
    assert_eq!(matches.len(), 1, "single canonical root clock token");
    let start = matches[0].0 + prefix.len();
    let token = serde_json::to_string(value).expect("clock JSON token");
    let end = start + token.len();
    assert_eq!(&text[start..end], token);
    assert!(text[end..].starts_with(",\n"), "canonical root field delimiter");
    bytes.splice(start..end, replacement.bytes());
}

fn validation_clocks(bytes: &mut Vec<u8>, validation: &Value, started: i64, ended: i64) {
    let timestamp = validation["recordedAtNs"].as_i64().expect("validation nanoseconds");
    window(timestamp / 1_000_000, started, ended);
    nested_clock(bytes, "recordedAtNs", timestamp);
    let mut clocks = std::collections::BTreeSet::new();
    for file in validation["files"]
        .as_object()
        .expect("validated files")
        .values()
    {
        assert!(file["size"].is_u64() && file["digest"].is_string());
        for key in ["mtimeNs", "ctimeNs"] {
            let timestamp = file[key].as_i64().expect("file clock nanoseconds");
            window(timestamp / 1_000_000, 0, ended);
            clocks.insert((key, timestamp));
        }
    }
    for (key, timestamp) in clocks {
        nested_clock(bytes, key, timestamp);
    }
}
fn nested_clock(bytes: &mut Vec<u8>, key: &str, timestamp: i64) {
    let text = std::str::from_utf8(bytes).expect("metadata UTF-8");
    let token = format!("\"{key}\": {timestamp},\n");
    assert!(text.contains(&token), "canonical nested clock token: {key}");
    *bytes = text
        .replace(&token, &format!("\"{key}\": 0,\n"))
        .into_bytes();
}
