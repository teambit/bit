//! Preserve canonical entries outside the selected ancestry.
use super::{HashSet, Value, json};

pub(super) fn compatible(rows: &[Value], ancestors: &[Value]) -> Option<bool> {
    if rows.len() > 128 {
        return None;
    }
    let mut seen = HashSet::new();
    for row in rows {
        let hash = canonical(row)?;
        if !seen.insert(hash) {
            return None;
        }
        if let Some(ancestor) = ancestors
            .iter()
            .find(|ancestor| ancestor["hash"] == hash)
            && ancestor != row
        {
            return Some(false);
        }
    }
    Some(true)
}

fn canonical(row: &Value) -> Option<&str> {
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
        .map(|value| valid_hash(value.as_str()?))
        .collect()
}

fn valid_hash(hash: &str) -> Option<&str> {
    (hash.len() == 40 && hash.bytes().all(|byte| byte.is_ascii_hexdigit())).then_some(hash)
}
