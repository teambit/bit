//! Semver version comparison ([`compare`]) and prerelease identifier ordering for `config-merge`.

use super::{array, invalid};
use serde_json::Value;
use std::{cmp::Ordering, io};

/// Compares two parsed semver descriptor objects (`major`, `minor`, `patch`, `prerelease`).
pub(super) fn compare(left: &Value, right: &Value) -> io::Result<Ordering> {
    for field in ["major", "minor", "patch"] {
        let left_number = left[field].as_u64().ok_or_else(|| invalid("semver number"))?;
        let right_number = right[field].as_u64().ok_or_else(|| invalid("semver number"))?;
        if left_number > 9_007_199_254_740_991 || right_number > 9_007_199_254_740_991 {
            return Err(invalid("semver number budget"));
        }
        if left_number != right_number {
            return Ok(left_number.cmp(&right_number));
        }
    }
    prerelease(array(left, "prerelease")?, array(right, "prerelease")?)
}
/// Compare two semver prerelease identifier arrays according to `SemVer` 2.0.0 precedence rules.
fn prerelease(left: &[Value], right: &[Value]) -> io::Result<Ordering> {
    if left.is_empty() != right.is_empty() {
        return Ok(if left.is_empty() { Ordering::Greater } else { Ordering::Less });
    }
    for (left_part, right_part) in left.iter().zip(right) {
        let ordering = identifier(left_part, right_part)?;
        if ordering != Ordering::Equal {
            return Ok(ordering);
        }
    }
    Ok(left.len().cmp(&right.len()))
}
fn identifier(left: &Value, right: &Value) -> io::Result<Ordering> {
    match (numeric(left), numeric(right)) {
        (Some(left_number), Some(right_number)) => Ok(left_number.total_cmp(&right_number)),
        (Some(_), None) if right.is_string() => Ok(Ordering::Less),
        (None, Some(_)) if left.is_string() => Ok(Ordering::Greater),
        _ => match (left.as_str(), right.as_str()) {
            (Some(left_text), Some(right_text)) => Ok(left_text.cmp(right_text)),
            _ => Err(invalid("semver identifier")),
        },
    }
}
pub(super) fn satisfies(input: &Value, version: &str, range: &str) -> io::Result<bool> {
    let (version, range) = (version.trim(), range.trim());
    let Some(candidate) = input
        .get(version)
        .and_then(|entry| entry.get("version"))
    else {
        return Ok(false);
    };
    let Some(sets) = input
        .get(range)
        .and_then(|entry| entry.get("range"))
        .and_then(Value::as_array)
    else {
        return Ok(false);
    };
    if sets.len() > 4096 {
        return Err(invalid("semver sets budget"));
    }
    for set in sets {
        let comparators = set
            .as_array()
            .filter(|values| values.len() <= 4096)
            .ok_or_else(|| invalid("semver set"))?;
        if matches_set(candidate, comparators)? {
            return Ok(true);
        }
    }
    Ok(false)
}
fn matches_set(candidate: &Value, comparators: &[Value]) -> io::Result<bool> {
    for comparator in comparators {
        if !matches_comparator(candidate, comparator)? {
            return Ok(false);
        }
    }
    if array(candidate, "prerelease")?.is_empty() {
        return Ok(true);
    }
    for comparator in comparators {
        if let Some(version) = comparator
            .get("version")
            .filter(|val| !val.is_null())
            && !array(version, "prerelease")?.is_empty()
            && ["major", "minor", "patch"]
                .iter()
                .all(|field| version[field] == candidate[field])
        {
            return Ok(true);
        }
    }
    Ok(false)
}
fn matches_comparator(candidate: &Value, comparator: &Value) -> io::Result<bool> {
    let Some(version) = comparator
        .get("version")
        .filter(|val| !val.is_null())
    else {
        return Ok(true);
    };
    let ordering = compare(candidate, version)?;
    match comparator["operator"].as_str().map(str::trim) {
        Some("" | "=") => Ok(ordering == Ordering::Equal),
        Some(">") => Ok(ordering == Ordering::Greater),
        Some(">=") => Ok(ordering != Ordering::Less),
        Some("<") => Ok(ordering == Ordering::Less),
        Some("<=") => Ok(ordering != Ordering::Greater),
        _ => Err(invalid("semver operator")),
    }
}
#[inline]
pub(super) fn greater(input: &Value, left: &str, right: &str) -> io::Result<bool> {
    let (left, right) = (left.trim(), right.trim());
    if left == right {
        return Ok(false);
    }
    Ok(compare(&input[left]["version"], &input[right]["version"])? == Ordering::Greater)
}

#[inline]
fn numeric(value: &Value) -> Option<f64> {
    if let Some(number) = value.as_u64() {
        return Some(number as f64);
    }
    let text = value.as_str()?.trim();
    if text.is_empty() || !text.bytes().all(|byte| byte.is_ascii_digit()) {
        return None;
    }
    text.parse().ok()
}
