//! One exact first-preimage and final-written digest for each owned publication.
use super::invalid;
use serde_json::Value;
use std::{collections::HashMap, io};

pub(super) fn combine(receipts: Vec<Value>) -> io::Result<Vec<Value>> {
    let mut positions = HashMap::<String, usize>::new();
    let mut result: Vec<Value> = Vec::new();
    for receipt in receipts {
        let path = receipt["path"].as_str().ok_or_else(|| invalid("inbound owned path"))?;
        super::super::super::path(std::path::Path::new(path))?;
        if let Some(&index) = positions.get(path) {
            if result[index]["afterHash"] != receipt["beforeHash"] {
                return Err(invalid("inbound owned publication preimages disagree"));
            }
            result[index]["afterHash"] = receipt["afterHash"].clone();
        } else {
            positions.insert(path.to_owned(), result.len());
            result.push(receipt);
        }
    }
    Ok(result)
}
