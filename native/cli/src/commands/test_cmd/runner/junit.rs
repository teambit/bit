//! Render the released tester `JUnit` report without loading Bit's `JavaScript` runtime.
//!
//! [`render`] and [`write`] format Jest JSON [`Value`] results into XML using [`cases`], [`xml`], [`suite`], and [`non_empty_str`].
mod cases;
#[cfg(test)]
mod tests;
mod xml;

use serde_json::Value;
use std::{fmt::Write, io};

/// Renders the `JUnit` XML report string from tester JSON `data` and raw Jest `raw` ([`Value`]) results via [`suite`].
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
/// Returns a trimmed non-empty string slice when `val` is a non-blank JSON string.
#[inline]
fn non_empty_str(val: &Value) -> Option<&str> {
    val.as_str()
        .map(str::trim)
        .filter(|text| !text.is_empty())
}

/// Extracts `<scope>/<name>` from a string or legacy object `componentId` [`Value`].
#[inline]
fn component_identity(id: &Value) -> Option<String> {
    if let Some(raw) = non_empty_str(id) {
        return Some(raw.to_owned());
    }
    let scope = non_empty_str(&id["_legacy"]["scope"])
        .or_else(|| non_empty_str(&id["_scope"]))
        .or_else(|| non_empty_str(&id["scope"]))?;
    let name = non_empty_str(&id["_legacy"]["name"]).or_else(|| non_empty_str(&id["name"]))?;
    Some(format!("{scope}/{name}"))
}

/// Appends the `<testsuite>` XML element and its [`cases`] for `component` ([`Value`]) onto `output` via [`component_identity`].
fn suite(output: &mut String, component: &Value, raw: &Value) -> io::Result<()> {
    let identity = component_identity(&component["componentId"])
        .ok_or_else(|| io::Error::other("JUnit identity"))?;
    let cases = cases::collect(component, raw)?;
    write!(output, r#"  <testsuite name="{}""#, xml::attribute(&identity)).unwrap();
    if let Some(start) = component["results"]["start"]
        .as_i64()
        .filter(|start| *start != 0)
    {
        let start = chrono::DateTime::from_timestamp_millis(start)
            .ok_or_else(|| io::Error::other("Invalid time value"))?
            .to_rfc3339_opts(chrono::SecondsFormat::Millis, true);
        write!(output, r#" timestamp="{start}""#).unwrap();
    }
    let (failures, errors, skipped) = cases
        .iter()
        .fold((0usize, 0usize, 0usize), |(fail, err, skip), case| {
            (
                fail + usize::from(case.failure.is_some()),
                err + usize::from(case.error.is_some()),
                skip + usize::from(case.skipped),
            )
        });
    writeln!(
        output,
        r#" tests="{}" failures="{failures}" errors="{errors}" skipped="{skipped}">"#,
        cases.len(),
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
    if path.as_os_str().is_empty()
        || path
            .to_str()
            .is_some_and(|text| text.trim().is_empty())
    {
        return Err(io::Error::other("JUnit output path cannot be empty"));
    }
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
#[inline]
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
