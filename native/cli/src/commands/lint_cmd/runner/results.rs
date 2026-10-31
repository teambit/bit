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

fn file(raw: &Value) -> Value {
    json!({"filePath":raw["filePath"],"errorCount":raw["errorCount"],
        "fatalErrorCount":raw["fatalErrorCount"],"fixableErrorCount":raw["fixableErrorCount"],
        "fixableWarningCount":raw["fixableWarningCount"],"warningCount":raw["warningCount"],
        "messages":raw["messages"],"raw":raw})
}

pub(super) fn aggregate(rows: Vec<Value>, errors: Vec<Value>) -> Value {
    let mut result = json!({"results": Value::Array(rows)});
    for (_, total, _, _) in COUNTS {
        result[total] = json!(
            result["results"]
                .as_array()
                .into_iter()
                .flatten()
                .map(|row| row[total].as_u64().unwrap_or(0))
                .sum::<u64>()
        );
    }
    for (_, total, components, _) in COUNTS {
        result[components] = json!(
            result["results"]
                .as_array()
                .into_iter()
                .flatten()
                .filter(|row| row[total].as_u64().unwrap_or(0) > 0)
                .count()
        );
    }
    result["isClean"] = json!(clean(&result));
    result["errors"] = Value::Array(errors);
    result
}

fn clean(result: &Value) -> bool {
    ["totalErrorCount", "totalFatalErrorCount", "totalWarningCount"]
        .iter()
        .all(|key| result[key].as_u64().unwrap_or(0) == 0)
        && result["errors"].as_array().is_none_or(Vec::is_empty)
}
