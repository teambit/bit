use super::{filtered, format};
use crate::commands::{color::Chalk, diff::options::parse};
use serde_json::json;

#[test]
fn filters_and_summarizes_diff_rows() {
    let result = json!([{"id":"s/one","_fullId":"s/one@1","hasDiff":true,
            "filesDiff":[{"filePath":"src/index.js","status":"MODIFIED","diffOutput":"--- old\n+++ new\n+one\n-two"}],
            "fieldsDiff":[{"fieldName":"dependencies","diffOutput":"deps"}]}]);
    let options = parse(&["--file", "index.js", "--stat"]).unwrap();
    let filtered = filtered(&result, &options).unwrap();
    assert_eq!(filtered[0]["fieldsDiff"], serde_json::Value::Null);
    assert_eq!(filtered[0]["filesDiff"][0]["additions"], 1);
    assert_eq!(
        format(&filtered, Chalk::new(false), &options).unwrap(),
        "showing diff for s/one\nM src/index.js  +1 -1",
    );
}
