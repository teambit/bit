//! Preserve canonical entries outside the selected ancestry.
use super::{HashSet, Value, json};

pub(super) fn valid_rows(rows: &[Value]) -> Option<bool> {
    if rows.len() > 128 {
        return None;
    }
    let mut seen = HashSet::new();
    for row in rows {
        let hash = canonical(row)?;
        if !seen.insert(hash) {
            return None;
        }
    }
    Some(true)
}

fn canonical(row: &Value) -> Option<&str> {
    row.as_object()?;
    let hash = valid_hash(row["hash"].as_str()?)?;
    let parents = refs(&row["parents"])?;
    let mut value = json!({"hash":hash,"parents":parents});
    if !row["unrelated"].is_null() {
        value["unrelated"] = json!(valid_hash(row["unrelated"].as_str()?)?);
    }
    if !row["squashed"].is_null() {
        value["squashed"] = json!(refs(&row["squashed"])?);
    }
    (serde_json::to_vec(row).ok()? == serde_json::to_vec(&value).ok()?).then_some(hash)
}

fn refs(value: &Value) -> Option<Vec<&str>> {
    let refs = value.as_array()?;
    if refs.len() > 128 {
        return None;
    }
    refs.iter()
        .map(|entry| {
            let text = entry
                .as_str()
                .or_else(|| entry.get("hash").and_then(Value::as_str))
                .or_else(|| entry.get("id").and_then(Value::as_str))?;
            valid_hash(text)
        })
        .collect()
}

fn valid_hash(hash: &str) -> Option<&str> {
    let hash = hash.trim();
    (hash.len() == 40
        && hash
            .bytes()
            .all(|byte| byte.is_ascii_digit() || matches!(byte, b'a'..=b'f')))
    .then_some(hash)
}

pub(super) fn complete_refs(value: &Value) -> Option<bool> {
    let values = refs(value)?;
    let mut unique = HashSet::new();
    Some(
        values
            .into_iter()
            .all(|value| unique.insert(value)),
    )
}
