//! Render the released tester `JUnit` report without loading Bit's JavaScript runtime.
mod cases;
#[cfg(test)]
mod tests;
mod xml;

use serde_json::Value;
use std::{fmt::Write, io};

pub(super) fn render(data: &str, raw: &Value) -> io::Result<String> {
    let data: Value = serde_json::from_str(data)?;
    let components = data[0]["data"]["components"]
        .as_array()
        .map_or(&[][..], Vec::as_slice);
    let mut result = "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n".to_owned();
    if components.is_empty() {
        result.push_str("<testsuites/>");
        return Ok(result);
    }
    result.push_str("<testsuites>\n");
    for component in components {
        suite(&mut result, component, raw)?;
    }
    result.push_str("</testsuites>");
    Ok(result)
}
fn suite(output: &mut String, component: &Value, raw: &Value) -> io::Result<()> {
    let identity = component["componentId"]
        .as_str()
        .map(str::trim)
        .filter(|id| !id.is_empty())
        .ok_or_else(|| io::Error::other("JUnit identity"))?;
    let cases = cases::collect(component, raw)?;
    write!(output, r#"  <testsuite name="{}""#, xml::attribute(identity)).unwrap();
    if let Some(start) = component["results"]["start"]
        .as_i64()
        .filter(|start| *start != 0)
    {
        let start = chrono::DateTime::from_timestamp_millis(start)
            .ok_or_else(|| io::Error::other("Invalid time value"))?
            .to_rfc3339_opts(chrono::SecondsFormat::Millis, true);
        write!(output, r#" timestamp="{start}""#).unwrap();
    }
    writeln!(
        output,
        r#" tests="{}" failures="{}" errors="{}" skipped="{}">"#,
        cases.len(),
        cases
            .iter()
            .filter(|case| case.failure.is_some())
            .count(),
        cases
            .iter()
            .filter(|case| case.error.is_some())
            .count(),
        cases
            .iter()
            .filter(|case| case.skipped)
            .count(),
    )
    .unwrap();
    for case in cases {
        case.render(output);
    }
    output.push_str("  </testsuite>\n");
    Ok(())
}

/// Write the report after tests complete, preserving filesystem errors without replay.
pub(super) fn write(path: &std::path::Path, data: &str, raw: &Value) -> io::Result<()> {
    use crate::commands::workspace_command::filesystem_error;
    let xml = render(data, raw)?;
    if let Some(parent) = path
        .parent()
        .filter(|parent| !parent.as_os_str().is_empty())
        && !parent.exists()
    {
        std::fs::create_dir_all(parent)
            .map_err(|error| filesystem_error::failure(error, "mkdir", parent))?;
    }
    std::fs::write(path, xml).map_err(|error| write_failure(error, path, cfg!(windows)))
}
fn write_failure(error: io::Error, path: &std::path::Path, windows: bool) -> io::Error {
    use crate::commands::workspace_command::filesystem_error;
    if windows && error.kind() == io::ErrorKind::PermissionDenied && path.is_dir() {
        let absolute = std::path::absolute(path).unwrap_or_else(|_| path.to_owned());
        return filesystem_error::failure(
            io::Error::from(io::ErrorKind::IsADirectory),
            "open",
            &absolute,
        );
    }
    filesystem_error::failure(error, "open", path)
}
