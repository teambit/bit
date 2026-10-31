use std::{collections::HashSet, io};

use super::{Value, invalid};

pub(super) fn entries(fields: &[(Vec<u16>, Value)]) -> io::Result<Vec<(&[u16], &Value)>> {
    if fields.is_empty() {
        return Ok(Vec::new());
    }
    if fields.len() > 262_144 {
        return Err(invalid("JavaScript object key limit"));
    }
    let mut seen = HashSet::with_capacity(fields.len());
    let mut indices = Vec::new();
    let mut names = Vec::new();
    for (key, value) in fields {
        if !seen.insert(key) {
            return Err(invalid("duplicate JavaScript own key"));
        }
        if matches!(value, Value::Undefined) {
            continue;
        }
        if let Some(index) = index(key) {
            indices.push((index, key.as_slice(), value));
        } else {
            names.push((key.as_slice(), value));
        }
    }
    indices.sort_unstable_by_key(|entry| entry.0);
    Ok(indices
        .into_iter()
        .map(|(_, key, value)| (key, value))
        .chain(names)
        .collect())
}

fn index(key: &[u16]) -> Option<u32> {
    if key.is_empty() || key.len() > 10 || (key.len() > 1 && key[0] == u16::from(b'0')) {
        return None;
    }
    let mut value = 0_u32;
    for &unit in key {
        let digit = unit.checked_sub(u16::from(b'0'))?;
        if digit > 9 {
            return None;
        }
        value = value
            .checked_mul(10)?
            .checked_add(u32::from(digit))?;
    }
    (value != u32::MAX).then_some(value)
}
