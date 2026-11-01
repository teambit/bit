//! One exact first-preimage and final-written digest for each owned publication.
use super::invalid;
use serde_json::Value;
use std::{collections::HashMap, io};

pub(super) fn combine(receipts: Vec<Value>) -> io::Result<Vec<Value>> {
    if receipts.len() > 16384 {
        return Err(invalid("inbound owned publication count"));
    }
    let mut positions = HashMap::<String, usize>::with_capacity(receipts.len());
    let mut result: Vec<Value> = Vec::with_capacity(receipts.len());
    for mut receipt in receipts {
        let (path, before, after) = normalize_receipt(&receipt)?;
        if let Some(&index) = positions.get(&path) {
            if result[index]["afterHash"] != before {
                return Err(invalid("inbound owned publication preimages disagree"));
            }
            result[index]["afterHash"] = after;
        } else {
            receipt["path"] = Value::String(path.clone());
            receipt["beforeHash"] = before;
            receipt["afterHash"] = after;
            positions.insert(path, result.len());
            result.push(receipt);
        }
    }
    Ok(result)
}

fn normalize_receipt(receipt: &Value) -> io::Result<(String, Value, Value)> {
    let path = receipt["path"]
        .as_str()
        .or_else(|| receipt["filePath"].as_str())
        .map(str::trim)
        .filter(|path| !path.is_empty())
        .ok_or_else(|| invalid("inbound owned path"))?
        .to_owned();
    super::super::super::path(std::path::Path::new(&path))?;
    let before = digest(receipt, "beforeHash", "before");
    let after = digest(receipt, "afterHash", "after");
    if !(before.is_null() || before.is_string()) || !(after.is_null() || after.is_string()) {
        return Err(invalid("inbound owned publication digest"));
    }
    Ok((path, before, after))
}

fn digest(receipt: &Value, direct_key: &str, nested_key: &str) -> Value {
    let has_value = |val: &Value| {
        !val.is_null()
            && val
                .as_str()
                .is_none_or(|txt| !txt.trim().is_empty())
    };
    let val = if has_value(&receipt[direct_key]) {
        &receipt[direct_key]
    } else if has_value(&receipt[nested_key]["hash"]) {
        &receipt[nested_key]["hash"]
    } else if has_value(&receipt[nested_key]["digest"]) {
        &receipt[nested_key]["digest"]
    } else {
        &receipt[nested_key]
    };
    match val.as_str().map(str::trim) {
        Some("") => Value::Null,
        Some(text) => Value::String(text.to_owned()),
        None => val.clone(),
    }
}
