use super::{Value, invalid, json, results};
use crate::commands::{
    color::Chalk,
    workspace_command::{component_service::Progress, format::Formatter, results::Report},
};
use std::{ffi::OsString, io};

pub(super) fn create(
    result: &Value,
    progress: &Progress,
    args: &[OsString],
    json: bool,
    elapsed: u64,
) -> io::Result<Report> {
    let code = i32::from(
        result["totalErrorCount"].as_u64().unwrap_or(0) > 0
            || result["totalFatalErrorCount"].as_u64().unwrap_or(0) > 0,
    );
    let data = if json {
        serde_json::to_string_pretty(&json!({"duration":{"elapsed":elapsed},"lintResults":result,
            "componentsIdsToLint":progress.identities}))?
    } else {
        text(result, progress, Chalk::detect(args), elapsed)?
    };
    Ok(Report { data, code, details: None })
}

fn text(result: &Value, progress: &Progress, chalk: Chalk, elapsed: u64) -> io::Result<String> {
    let formatter = Formatter::new(chalk);
    let rows = result["results"].as_array().ok_or_else(|| invalid("linter report rows"))?;
    let mut sections = vec![formatter.title(&format!(
        "linting total of {} component(s) in workspace '{}'",
        progress.identities.len(),
        progress.name.trim(),
    ))];
    let dirty: Vec<_> = rows
        .iter()
        .filter(|row| row["isClean"] == false)
        .map(|row| component(row, &formatter))
        .collect::<io::Result<_>>()?;
    sections.push(dirty.join("\n"));
    let clean = rows
        .iter()
        .filter(|row| row["isClean"] == true)
        .count();
    if clean > 0 {
        sections.push(formatter.success_summary(&format!(
            "{clean} component(s) have no linting issues",
        )));
    }
    sections.push(summary(result, progress.identities.len(), elapsed));
    Ok(Formatter::join(&sections))
}

fn component(row: &Value, formatter: &Formatter) -> io::Result<String> {
    let id = &row["componentId"];
    let (scope, name) = if let Some(raw) = id.as_str() {
        raw.rsplit_once('@')
            .map_or(raw, |(bare, _)| bare)
            .split_once('/')
            .map(|(scope, name)| (scope.trim(), name.trim()))
            .filter(|(scope, name)| !scope.is_empty() && !name.is_empty())
            .ok_or_else(|| invalid("linter report scope"))?
    } else {
        let scope = id["_legacy"]["scope"]
            .as_str()
            .or_else(|| id["_scope"].as_str())
            .or_else(|| id["scope"].as_str())
            .map(str::trim)
            .filter(|scope| !scope.is_empty())
            .ok_or_else(|| invalid("linter report scope"))?;
        let name = id["_legacy"]["name"]
            .as_str()
            .or_else(|| id["name"].as_str())
            .map(str::trim)
            .filter(|name| !name.is_empty())
            .ok_or_else(|| invalid("linter report name"))?;
        (scope, name)
    };
    let output = row["output"].as_str().ok_or_else(|| invalid("linter report output"))?;
    Ok(format!(
        "{}\n{output}",
        formatter.chalk.bold(&formatter.chalk.cyan(&format!("{scope}/{name}"))),
    ))
}

fn summary(result: &Value, count: usize, elapsed: u64) -> String {
    let seconds = elapsed / 1000;
    let fraction = elapsed % 1000;
    let seconds = if fraction == 0 {
        seconds.to_string()
    } else {
        format!("{seconds}.{fraction:03}").trim_end_matches('0').to_owned()
    };
    let totals: Vec<_> = results::COUNTS
        .iter()
        .filter_map(|(_, total, components, label)| {
            let count = result[total].as_u64().unwrap_or(0);
            (count > 0).then(|| {
                format!("total of {count} {label} (from {} components)", result[components])
            })
        })
        .collect();
    format!("linted {count} components in {seconds} seconds\n{}", totals.join("\n"))
}
