//! One exact first-preimage and final-written digest for each owned publication.
use super::invalid;
use serde_json::Value;
use std::{collections::HashMap, io};

pub(super) fn combine(receipts: Vec<Value>) -> io::Result<Vec<Value>> {
    let mut positions = HashMap::<String, usize>::new();
    let mut result: Vec<Value> = Vec::new();
    for mut receipt in receipts {
        let path = receipt["path"]
            .as_str()
            .or_else(|| receipt["filePath"].as_str())
            .map(str::trim)
            .filter(|path| !path.is_empty())
            .ok_or_else(|| invalid("inbound owned path"))?
            .to_owned();
        super::super::super::path(std::path::Path::new(&path))?;
        let before = digest(&receipt, "beforeHash", "before");
        let after = digest(&receipt, "afterHash", "after");
        receipt["path"] = Value::String(path.clone());
        receipt["beforeHash"] = before.clone();
        receipt["afterHash"] = after.clone();
        if let Some(&index) = positions.get(&path) {
            if result[index]["afterHash"] != before {
                return Err(invalid("inbound owned publication preimages disagree"));
            }
            result[index]["afterHash"] = after;
        } else {
            positions.insert(path, result.len());
            result.push(receipt);
        }
    }
    Ok(result)
}

fn digest(receipt: &Value, direct_key: &str, nested_key: &str) -> Value {
    if !receipt[direct_key].is_null() {
        return receipt[direct_key].clone();
    }
    if !receipt[nested_key]["hash"].is_null() {
        return receipt[nested_key]["hash"].clone();
    }
    if !receipt[nested_key]["digest"].is_null() {
        return receipt[nested_key]["digest"].clone();
    }
    receipt[nested_key].clone()
}
