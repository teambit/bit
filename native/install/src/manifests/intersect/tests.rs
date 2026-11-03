//! Unit tests for `semver-range-intersect` 0.3.1 compatibility ([`intersect`], [`expected`]) against [`golden`]
//! fixtures in `bit-install` range intersection.

use super::intersect;
use crate::manifests::semver::tests::golden;
use serde_json::Value;

/// `"THROW"` in the fixture is a `JavaScript` exception, mapped to `Err(())` here.
fn expected(value: &Value) -> Result<Option<String>, ()> {
    match value.as_str() {
        Some("THROW") => Err(()),
        other => Ok(other.map(str::to_string)),
    }
}

/// Verifies two-range [`intersect`] results against the `semver-range-intersect` 0.3.1 [`golden`] corpus.
#[test]
fn pairs_match_semver_range_intersect() {
    for case in golden()["intersectPairs"].as_array().unwrap() {
        let (a, b) = (case[0].as_str().unwrap(), case[1].as_str().unwrap());
        assert_eq!(
            intersect(&[a, b]).map_err(|_| ()),
            expected(&case[2]),
            "intersect({a:?}, {b:?})",
        );
    }
}

/// Verifies multi-range [`intersect`] results against the `semver-range-intersect` 0.3.1 `multi` [`golden`] corpus via [`expected`].
#[test]
fn many_ranges_match_semver_range_intersect() {
    for case in golden()["multi"].as_array().unwrap() {
        let ranges: Vec<&str> = case[0]
            .as_array()
            .unwrap()
            .iter()
            .map(|range| range.as_str().unwrap())
            .collect();
        assert_eq!(intersect(&ranges).map_err(|_| ()), expected(&case[1]), "intersect({ranges:?})");
    }
}
