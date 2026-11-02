//! Unit tests for `bit diff` file filtering ([`filtered`]) and `--stat` summary rendering ([`format`]).
//!
//! Verifies [`parse`]d `--file` filtering, line addition/deletion counts, and [`Chalk`] output.

use super::{filtered, format};
use crate::commands::{color::Chalk, diff::options::parse};
use serde_json::json;

/// Verifies that [`filtered`] and [`format`] filter diff rows by `--file` and render `--stat` summaries.
/// Ensures `fieldsDiff` is cleared when `--file` filters are active.
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

/// Verifies that [`format`] renders the `there are no modified components to diff` message when empty.
///
/// Ensures an empty JSON array produces the canonical non-modified notice.
#[test]
fn empty_diff_rows_format_no_modified_components_warning() {
    let options = parse(&[]).unwrap();
    assert_eq!(
        format(&json!([]), Chalk::new(false), &options).unwrap(),
        "there are no modified components to diff",
    );
}
