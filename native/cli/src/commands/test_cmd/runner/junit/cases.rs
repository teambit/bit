use super::xml;
use serde_json::Value;
use std::{fmt::Write, io};

pub(super) struct Case {
    file: String,
    name: String,
    duration: Option<u64>,
    pub failure: Option<String>,
    pub error: Option<String>,
    pub skipped: bool,
}
impl Case {
    pub(super) fn render(&self, output: &mut String) {
        write!(
            output,
            r#"    <testcase classname="{}" name="{}""#,
            xml::attribute(&self.file),
            xml::attribute(&self.name),
        )
        .unwrap();
        if let Some(duration) = self.duration.filter(|duration| *duration != 0) {
            let seconds = duration / 1000;
            let fraction = duration % 1000;
            let time = if fraction == 0 {
                seconds.to_string()
            } else {
                format!("{seconds}.{fraction:03}").trim_end_matches('0').to_owned()
            };
            write!(output, r#" time="{time}""#).unwrap();
        }
        if self.failure.is_none() && self.error.is_none() && !self.skipped {
            output.push_str("/>\n");
            return;
        }
        output.push_str(">\n");
        message(output, "failure", self.failure.as_deref());
        message(output, "error", self.error.as_deref());
        if self.skipped {
            output.push_str("      <skipped/>\n");
        }
        output.push_str("    </testcase>\n");
    }
}
fn message(output: &mut String, kind: &str, message: Option<&str>) {
    let Some(message) = message else {
        return;
    };
    let message = xml::strip_ansi(message);
    if message.is_empty() {
        writeln!(output, "      <{kind}/>").unwrap();
    } else {
        writeln!(output, r#"      <{kind} message="{}"/>"#, xml::attribute(&message)).unwrap();
    }
}
pub(super) fn collect(component: &Value, raw: &Value) -> io::Result<Vec<Case>> {
    let mut cases = Vec::new();
    let source = source_rows(component, raw);
    for (index, file) in component["results"]["testFiles"]
        .as_array()
        .ok_or_else(|| io::Error::other("JUnit files"))?
        .iter()
        .enumerate()
    {
        let name = file["file"].as_str().ok_or_else(|| io::Error::other("JUnit filename"))?;
        if file.get("error").is_some() {
            cases.push(Case {
                file: name.to_owned(),
                name: name.to_owned(),
                duration: None,
                failure: None,
                error: Some(file_error(source, index)?),
                skipped: false,
            });
        }
        for test in file["tests"].as_array().ok_or_else(|| io::Error::other("JUnit assertions"))? {
            cases.push(Case {
                file: name.to_owned(),
                name: test["name"]
                    .as_str()
                    .ok_or_else(|| io::Error::other("JUnit test name"))?
                    .to_owned(),
                duration: test["duration"].as_u64(),
                failure: test["failureErrOrStr"]
                    .as_str()
                    .filter(|value| !value.is_empty())
                    .map(str::to_owned),
                error: test["error"]
                    .as_str()
                    .filter(|value| !value.is_empty())
                    .map(str::to_owned),
                skipped: matches!(test["status"].as_str(), Some("pending" | "skipped")),
            });
        }
    }
    Ok(cases)
}
fn source_rows<'a>(component: &Value, raw: &'a Value) -> &'a Value {
    let id = &component["componentId"];
    let owned = if id.is_string() {
        None
    } else {
        let scope = id["_legacy"]["scope"]
            .as_str()
            .or_else(|| id["_scope"].as_str())
            .or_else(|| id["scope"].as_str())
            .map(str::trim)
            .filter(|scope| !scope.is_empty());
        let name = id["_legacy"]["name"]
            .as_str()
            .or_else(|| id["name"].as_str())
            .map(str::trim)
            .filter(|name| !name.is_empty());
        scope
            .zip(name)
            .map(|(scope, name)| format!("{scope}/{name}"))
    };
    id.as_str()
        .map(str::trim)
        .filter(|id| !id.is_empty())
        .or(owned.as_deref())
        .and_then(|identity| raw["componentRows"].get(identity))
        .unwrap_or_else(|| &raw["results"]["testResults"])
}

fn file_error(rows: &Value, index: usize) -> io::Result<String> {
    let row = rows.get(index).ok_or_else(|| io::Error::other("JUnit source file"))?;
    Ok(row["executionErrorMessage"]
        .as_str()
        .unwrap_or_default()
        .to_owned())
}
