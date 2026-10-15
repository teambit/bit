use super::{format, prepared, published};
use crate::commands::color::Chalk;
use serde_json::json;

fn receipt(components: &[&str], remote: &[&str]) -> serde_json::Value {
    json!({
        "token": "outbound-1", "owner": "rust", "applied": true,
        "componentsIds": components, "newIdsOnRemote": remote,
        "nonExistOnBitMap": [], "removedIds": [], "missingScope": [],
        "exportedLanes": [], "rippleJobUrls": [],
    })
}

#[test]
fn reads_the_prepared_transfers() {
    let value = json!({
        "token": "outbound-1", "owner": "rust", "nothingToExport": false, "componentCount": 2,
        "scopes": ["a", "b"], "scopeObjectCounts": [5, 3], "fileRemote": true, "objectCount": 8,
    });
    let prepared = prepared(&value).unwrap();
    assert_eq!(prepared.transfers, [("a".to_string(), 5), ("b".to_string(), 3)]);
    assert_eq!(prepared.count, 2);
    let mut empty = value;
    empty["componentCount"] = json!(0);
    assert!(super::prepared(&empty).is_err(), "nothingToExport must match the count");
    empty["lane"] = json!("s/study");
    assert!(super::prepared(&empty).is_ok(), "an empty lane still has objects to export");
}

#[test]
fn validates_the_published_ids() {
    let valid = receipt(&["s/a"], &["s/a@0.0.1"]);
    assert!(published(&valid, "outbound-1").is_ok());
    assert!(published(&valid, "outbound-2").is_err());
    assert!(published(&receipt(&["s/a@0.0.1"], &[]), "outbound-1").is_err());
    assert!(published(&receipt(&["s/a"], &["s/b@0.0.1"]), "outbound-1").is_err());
    let mut missing = valid;
    missing["missingScope"] = json!(["s/c"]);
    assert!(published(&missing, "outbound-1").is_err());
}

#[test]
fn reports_the_exported_components() {
    let chalk = Chalk::new(false);
    assert_eq!(
        format(&receipt(&["s/a", "s/b"], &[]), chalk),
        "exported components (2)\n  exported the following component(s)\n   \u{203A} s/a\n   \u{203A} s/b",
    );
    assert_eq!(format(&receipt(&[], &[]), chalk), "nothing to export");
}

#[test]
fn reports_an_exported_lane_with_and_without_new_versions() {
    let chalk = Chalk::new(false);
    let mut one = receipt(&["s/a"], &["s/a@123"]);
    one["exportedLanes"] = json!(["s/study"]);
    assert!(published(&one, "outbound-1").is_ok());
    assert_eq!(
        format(&one, chalk),
        "exported components (1)\n  exported the lane s/study and the following component(s)\n   \u{203A} s/a",
    );
    let mut empty = receipt(&[], &[]);
    empty["exportedLanes"] = json!(["s/study"]);
    assert_eq!(format(&empty, chalk), "exported lane (1)\n   \u{203A} s/study");
}
