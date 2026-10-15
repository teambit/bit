use super::invalid;
use serde_json::Value;
use std::io;

pub(super) fn validate(value: &Value) -> io::Result<()> {
    let Some(entries) = value.get("extensions").and_then(Value::as_array) else { return Ok(()) };
    let Some(builder) = entries
        .iter()
        .find(|entry| {
            entry.get("name").and_then(Value::as_str) == Some("teambit.pipelines/builder")
        })
    else {
        return Ok(());
    };
    let Some(artifacts) = builder
        .get("data")
        .and_then(|data| data.get("artifacts"))
        .filter(|value| !value.is_null() && value != &&Value::Bool(false))
    else {
        return Ok(());
    };
    validate_artifacts(artifacts)
}
fn validate_artifacts(artifacts: &Value) -> io::Result<()> {
    let artifacts =
        artifacts.as_array().ok_or_else(|| invalid("history query builder artifact array"))?;
    if artifacts.len() > 4096 {
        return Err(invalid("history query artifact count"));
    }
    let mut count = 0;
    for artifact in artifacts {
        if !artifact.is_object() {
            return Err(invalid("history query artifact object"));
        }
        let Some(files) = artifact.get("files") else { continue };
        let files = files.as_array().ok_or_else(|| invalid("history query artifact files"))?;
        count += files.len();
        if count > 4096 {
            return Err(invalid("history query artifact file count"));
        }
        for file in files {
            validate_file(file)?;
        }
    }
    Ok(())
}
fn validate_file(file: &Value) -> io::Result<()> {
    let reference = file
        .get("file")
        .and_then(Value::as_str)
        .ok_or_else(|| invalid("history query artifact Source ref"))?;
    crate::merge_history::hash(reference)?;
    let path = file
        .get("relativePath")
        .and_then(Value::as_str)
        .ok_or_else(|| invalid("history query artifact path"))?;
    if path.len() > 32768
        || path.contains('\0')
        || file
            .get("url")
            .is_some_and(|value| !value.is_string())
    {
        return Err(invalid("history query artifact metadata"));
    }
    Ok(())
}
