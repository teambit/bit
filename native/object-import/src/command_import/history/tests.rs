//! `VersionHistory.merge` keeps incoming rows first and retains existing-only rows in order.
use super::merge;
use crate::command_import::publish;
use serde_json::{Value, json};

fn row(index: usize) -> Value {
    json!({"hash":format!("{index:040x}"),"parents":if index == 0 {Vec::new()} else {vec![format!("{:040x}", index-1)]}})
}
fn history(rows: Vec<Value>) -> Value {
    let mut value = json!({"name":"component","scope":"fixture.scope","graphCompleteRefs":[]});
    value["versions"] = Value::Array(rows);
    value
}

#[test]
fn large_history_merge_preserves_incoming_overrides_and_existing_only_order() {
    let old = history((0..40000).map(row).collect());
    let mut incoming = history((0..20000).rev().map(row).collect());
    incoming["versions"][2]["parents"] = json!(["f".repeat(40)]);
    let stored = publish::object(&"a".repeat(40), "VersionHistory", old.clone()).unwrap();
    let merged = merge(Some(&stored), &incoming).unwrap();
    let rows = merged["versions"].as_array().unwrap();
    assert_eq!(rows.len(), 40000);
    assert_eq!(&rows[..20000], incoming["versions"].as_array().unwrap());
    assert_eq!(&rows[20000..], &old["versions"].as_array().unwrap()[20000..]);
    assert_eq!(merged["scope"], old["scope"]);
    assert_eq!(merged["name"], old["name"]);
}

#[test]
fn empty_history_merges_preserve_rows_and_existing_graph_metadata() {
    let mut old = history((0..3).map(row).collect());
    old["graphCompleteRefs"] = json!([format!("{:040x}", 2)]);
    let stored = publish::object(&"a".repeat(40), "VersionHistory", old.clone()).unwrap();
    assert_eq!(merge(Some(&stored), &history(Vec::new())).unwrap(), old);
    let empty = publish::object(&"a".repeat(40), "VersionHistory", history(Vec::new())).unwrap();
    let merged = merge(Some(&empty), &old).unwrap();
    assert_eq!(merged["versions"], old["versions"]);
    assert_eq!(merged["graphCompleteRefs"], json!([]));
    assert_eq!(merge(None, &old).unwrap(), old);
}
