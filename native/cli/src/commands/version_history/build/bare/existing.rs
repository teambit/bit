//! Preserve canonical entries outside the selected ancestry.
//!
//! [`valid_rows`] and [`canonical`] validate stored version-history [`Value`] rows using a [`HashSet`].
use super::{HashSet, Value, json};

/// Validates that `rows` ([`Value`]) has at most 128 canonical, unique version-history entries via [`canonical`].
#[inline]
pub(super) fn valid_rows(rows: &[Value]) -> Option<bool> {
    if rows.len() > 128 {
        return None;
    }
    let mut seen = HashSet::with_capacity(rows.len());
    for row in rows {
        let hash = canonical(row)?;
        if !seen.insert(hash) {
            return None;
        }
    }
    Some(true)
}

/// Verifies that `row` has canonical key order and valid SHA-1 hashes, returning its `"hash"`.
#[inline]
fn canonical(row: &Value) -> Option<&str> {
    row.as_object()?;
    let hash = valid_hash(row["hash"].as_str()?)?;
    let parents = refs(&row["parents"])?;
    let mut value = json!({"hash":hash,"parents":parents});
    if let Some(unrelated) = row
        .get("unrelated")
        .filter(|val| !val.is_null())
    {
        value["unrelated"] = json!(valid_hash(unrelated.as_str()?)?);
    }
    if let Some(squashed) = row
        .get("squashed")
        .filter(|val| !val.is_null())
    {
        value["squashed"] = json!(refs(squashed)?);
    }
    (serde_json::to_vec(row).ok()? == serde_json::to_vec(&value).ok()?).then_some(hash)
}

/// Extracts up to 128 validated 40-hex-character SHA-1 hashes from array `value`.
#[inline]
fn refs(value: &Value) -> Option<Vec<&str>> {
    let refs = value.as_array()?;
    if refs.len() > 128 {
        return None;
    }
    refs.iter()
        .map(|entry| {
            let text = [
                entry.as_str(),
                entry.get("hash").and_then(Value::as_str),
                entry.get("id").and_then(Value::as_str),
            ]
            .into_iter()
            .flatten()
            .map(str::trim)
            .find(|val| !val.is_empty())?;
            valid_hash(text)
        })
        .collect()
}

/// Returns `hash` trimmed when it is a 40-character lowercase ASCII hexadecimal SHA-1 digest.
#[inline]
fn valid_hash(hash: &str) -> Option<&str> {
    let hash = hash.trim();
    (hash.len() == 40
        && hash
            .bytes()
            .all(|byte| byte.is_ascii_digit() || matches!(byte, b'a'..=b'f')))
    .then_some(hash)
}

/// Verifies that `value` is a valid SHA-1 reference array with no duplicate hashes.
#[inline]
pub(super) fn complete_refs(value: &Value) -> Option<bool> {
    let values = refs(value)?;
    let mut unique = HashSet::with_capacity(values.len());
    Some(
        values
            .into_iter()
            .all(|value| unique.insert(value)),
    )
}
