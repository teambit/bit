//! Component and command totals from `ESLint`'s unmodified diagnostic records.
use super::{Value, invalid, json};
use std::io;

pub(super) const COUNTS: [(&str, &str, &str, &str); 5] = [
    ("errorCount", "totalErrorCount", "totalComponentsWithErrorCount", "Errors"),
    (
        "fatalErrorCount",
        "totalFatalErrorCount",
        "totalComponentsWithFatalErrorCount",
        "FatalErrors",
    ),
    (
        "fixableErrorCount",
        "totalFixableErrorCount",
        "totalComponentsWithFixableErrorCount",
        "FixableErrors",
    ),
    (
        "fixableWarningCount",
        "totalFixableWarningCount",
        "totalComponentsWithFixableWarningCount",
        "FixableWarnings",
    ),
    ("warningCount", "totalWarningCount", "totalComponentsWithWarningCount", "Warnings"),
];

#[inline]
pub(super) fn component(id: &Value, tool: &Value) -> io::Result<Value> {
    let files = tool["results"].as_array().ok_or_else(|| invalid("linter results"))?;
    let output = tool["output"].as_str().unwrap_or_default();
    let mut result = json!({"componentId":id,"output":output});
    for (field, total, _, _) in COUNTS {
        result[total] = json!(
            files
                .iter()
                .map(|file| file[field].as_u64().unwrap_or(0))
                .sum::<u64>()
        );
    }
    result["isClean"] = json!(clean(&result));
    result["results"] = json!(
        files
            .iter()
            .map(file)
            .collect::<Vec<_>>()
    );
    Ok(result)
}

#[inline]
fn file(raw: &Value) -> Value {
    let file_path = raw["filePath"]
        .as_str()
        .map_or_else(|| raw["filePath"].clone(), |path| json!(path.trim()));
    let messages = raw["messages"]
        .as_array()
        .cloned()
        .unwrap_or_default();
    json!({
        "filePath": file_path,
        "errorCount": raw["errorCount"].as_u64().unwrap_or(0),
        "fatalErrorCount": raw["fatalErrorCount"].as_u64().unwrap_or(0),
        "fixableErrorCount": raw["fixableErrorCount"].as_u64().unwrap_or(0),
        "fixableWarningCount": raw["fixableWarningCount"].as_u64().unwrap_or(0),
        "warningCount": raw["warningCount"].as_u64().unwrap_or(0),
        "messages": messages,
        "raw": raw,
    })
}

#[inline]
pub(super) fn aggregate(rows: Vec<Value>, errors: Vec<Value>) -> Value {
    let mut result = json!({});
    for (_, total, components, _) in COUNTS {
        result[total] = json!(
            rows.iter()
                .map(|row| row[total].as_u64().unwrap_or(0))
                .sum::<u64>()
        );
        result[components] = json!(
            rows.iter()
                .filter(|row| row[total].as_u64().unwrap_or(0) > 0)
                .count()
        );
    }
    result["results"] = Value::Array(rows);
    result["isClean"] = json!(clean(&result));
    result["errors"] = Value::Array(errors);
    result
}

#[inline]
fn clean(result: &Value) -> bool {
    ["totalErrorCount", "totalFatalErrorCount", "totalWarningCount"]
        .iter()
        .all(|key| result[key].as_u64().unwrap_or(0) == 0)
        && result["errors"].as_array().is_none_or(Vec::is_empty)
}
