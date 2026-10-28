//! Project external Jest results into the released tester JSON contract.
use crate::commands::workspace_command::results::Report;
use serde_json::{Value, json};
use std::{io, path::Path};

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
    let components = if files.is_empty() {
        Vec::new()
    } else {
        vec![json!({"componentId":identity,"results":{
            "testFiles":files,"success":results["success"],"start":results["startTime"],
            "coverage":raw.get("coverage").cloned().unwrap_or_else(super::coverage::empty)},"errors":errors})]
    };
    Ok(Report {
        data: serde_json::to_string_pretty(
            &json!([{"data":{"components":components,"errors":errors}}]),
        )?,
        code: raw["exitCode"]
            .as_i64()
            .filter(|code| *code != 0)
            .map(i32::try_from)
            .transpose()
            .map_err(io::Error::other)?
            .unwrap_or_else(|| i32::from(!errors.is_empty())),
        details: None,
    })
}
fn file(row: &Value) -> io::Result<Value> {
    let path = row["testFilePath"].as_str().ok_or_else(|| invalid("test file path"))?;
    let name = Path::new(path)
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| invalid("test file name"))?;
    let tests = row["testResults"]
        .as_array()
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
fn test(row: &Value) -> Value {
    let mut value = json!({"ancestor":row["ancestorTitles"],"name":row["title"],"status":row["status"],"duration":row["duration"]});
    if let Some(message) = row["formattedError"]
        .as_str()
        .filter(|message| !message.is_empty())
    {
        value[if row["status"] == "failed" { "failureErrOrStr" } else { "error" }] = json!(message);
    }
    value
}
fn error(row: &Value) -> Option<Value> {
    let source = &row["testExecError"];
    if source.is_null() && row["failureMessage"].as_str().is_none_or(str::is_empty) {
        return None;
    }
    let mut value = json!({});
    for key in ["code", "type"] {
        if let Some(entry) = source.get(key) {
            value[key] = entry.clone();
        }
    }
    Some(value)
}
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
fn invalid(message: &str) -> io::Error {
    io::Error::other(message)
}
