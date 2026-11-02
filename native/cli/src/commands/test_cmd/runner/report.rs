//! Project external Jest results into the released tester JSON contract.
//!
//! [`report`] transforms raw Jest [`Value`] output at a workspace [`Path`] into a command [`Report`].
use crate::commands::workspace_command::results::Report;
use serde_json::{Value, json};
use std::{io, path::Path};

/// Projects raw Jest worker output `raw` for `identity` into the `--json` tester [`Report`].
pub(super) fn report(raw: &Value, identity: &str) -> io::Result<Report> {
    if let Some(error) = raw.get("error") {
        return environment_error(error, &raw["exitCode"]);
    }
    if let Some(code) = raw["terminated"].as_i64() {
        return Ok(Report {
            data: String::new(),
            code: i32::try_from(code).map_err(io::Error::other)?,
            details: None,
        });
    }
    let results = &raw["results"];
    let rows = results["testResults"].as_array().ok_or_else(|| invalid("test results"))?;
    let files = rows
        .iter()
        .map(file)
        .collect::<io::Result<Vec<_>>>()?;
    let errors: Vec<_> = rows.iter().filter_map(error).collect();
    let has_errors = !errors.is_empty();
    let components = if files.is_empty() {
        Vec::new()
    } else {
        vec![json!({"componentId":identity,"results":{
            "testFiles":files,"success":results["success"],"start":results["startTime"],
            "coverage":raw.get("coverage").cloned().unwrap_or_else(super::coverage::empty)},"errors":errors})]
    };
    Ok(Report {
        data: serde_json::to_string_pretty(&json!([{"data":{
            "components": Value::Array(components),
            "errors": Value::Array(errors),
        }}]))?,
        code: raw["exitCode"]
            .as_i64()
            .filter(|code| *code != 0)
            .map(i32::try_from)
            .transpose()
            .map_err(io::Error::other)?
            .unwrap_or_else(|| i32::from(has_errors)),
        details: None,
    })
}
/// Projects a single Jest `testResults` `row` [`Value`] into a Bit tester `testFiles` entry.
fn file(row: &Value) -> io::Result<Value> {
    let non_empty = |key: &str| {
        row[key]
            .as_str()
            .map(str::trim)
            .filter(|val| !val.is_empty())
    };
    let path = non_empty("testFilePath")
        .or_else(|| non_empty("name"))
        .or_else(|| non_empty("file"))
        .ok_or_else(|| invalid("test file path"))?;
    let name = Path::new(path)
        .file_name()
        .and_then(|name| name.to_str())
        .map(str::trim)
        .filter(|name| !name.is_empty())
        .ok_or_else(|| invalid("test file name"))?;
    let tests = row["testResults"]
        .as_array()
        .or_else(|| row["assertionResults"].as_array())
        .ok_or_else(|| invalid("test assertions"))?
        .iter()
        .map(test)
        .collect::<Vec<_>>();
    let mut result = json!({"file":name,"tests":tests,"pass":row["numPassingTests"],"failed":row["numFailingTests"],"pending":row["numPendingTests"],"duration":row["perfStats"]["runtime"],"slow":row["perfStats"]["slow"]});
    if !row["testExecError"].is_null() {
        result["error"] = json!({});
    }
    Ok(result)
}
/// Projects a single Jest assertion row into a Bit tester `tests` entry.
#[inline]
fn test(row: &Value) -> Value {
    let mut value = json!({"ancestor":row["ancestorTitles"],"name":row["title"],"status":row["status"],"duration":row["duration"]});
    let message = row["formattedError"]
        .as_str()
        .filter(|message| !message.is_empty())
        .or_else(|| {
            row["failureMessages"]
                .as_array()?
                .iter()
                .filter_map(Value::as_str)
                .find(|message| !message.is_empty())
        });
    if let Some(message) = message {
        let failed = row["status"].as_str().map(str::trim) == Some("failed");
        value[if failed { "failureErrOrStr" } else { "error" }] = json!(message);
    }
    value
}
fn error(row: &Value) -> Option<Value> {
    let source = &row["testExecError"];
    if source.is_null()
        && row["failureMessage"]
            .as_str()
            .map(str::trim)
            .is_none_or(str::is_empty)
    {
        return None;
    }
    let mut value = json!({});
    for key in ["code", "type"] {
        let captured = if key == "code" { "executionErrorCode" } else { "executionErrorType" };
        if let Some(entry) = row
            .get(captured)
            .or_else(|| source.get(key))
        {
            value[key] = entry.clone();
        }
    }
    Some(value)
}
#[inline]
fn environment_error(error: &Value, code: &Value) -> io::Result<Report> {
    Ok(Report {
        data: serde_json::to_string_pretty(&json!([{"data":{},"error":error}]))?,
        code: code
            .as_i64()
            .filter(|code| *code != 0)
            .map(i32::try_from)
            .transpose()
            .map_err(io::Error::other)?
            .unwrap_or(1),
        details: None,
    })
}
#[inline]
fn invalid(message: &str) -> io::Error {
    io::Error::other(message)
}
