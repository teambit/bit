//! The merge's snapshot results: `mergeSnapResults` and `mergeSnapError`
//! validated, and the snaps section
//! of `mergeReport`.

use super::rows;
use crate::commands::{
    ids::Id,
    status::js::{array, decline, object, text},
    workspace_command::format::Formatter,
};
use serde_json::Value;
use std::{fmt::Write, io};

/// `AUTO_SNAPPED_MSG`.
const AUTO_SNAPPED: &str = "auto-snapped dependents";
/// `ISSUE_FORMAT_SPACE`.
const ISSUE_SPACE: &str = "          ";

/// `mergeSnapResults`: the snapped components and the dependents snapped
/// with them.
pub struct Snaps {
    pub snapped: Vec<Id>,
    /// Each auto-snapped component and the components that triggered it.
    pub auto: Vec<(Id, Vec<Id>)>,
}

/// `mergeSnapError`, a `ComponentsHaveIssues` whose only issues are
/// missing manually configured packages.
pub struct SnapError {
    /// Each component and the packages of each of its issues.
    pub components: Vec<(Id, Vec<Vec<String>>)>,
    message: Option<String>,
}

/// An object with no keys outside `keys`.
fn record<'v>(value: &'v Value, keys: &[&str]) -> io::Result<&'v serde_json::Map<String, Value>> {
    let map = object(value)?;
    if map
        .keys()
        .any(|key| !keys.contains(&key.as_str()))
    {
        return Err(decline("native command report shape"));
    }
    Ok(map)
}

fn id(value: Option<&Value>) -> io::Result<Id> {
    let value = value.ok_or_else(|| decline("native command report identity"))?;
    if value
        .as_str()
        .is_some_and(|raw| raw.len() > 4096)
    {
        return Err(decline("native command report identity"));
    }
    Id::from_object(value)
}

pub fn snaps(value: Option<&Value>) -> io::Result<Option<Snaps>> {
    let Some(value) = value.filter(|value| !value.is_null()) else { return Ok(None) };
    let map = record(value, &["snappedComponents", "autoSnappedResults"])?;
    let snapped = rows(map.get("snappedComponents"))?
        .iter()
        .map(|row| id(record(row, &["id"])?.get("id")))
        .collect::<io::Result<_>>()?;
    let auto = rows(map.get("autoSnappedResults"))?
        .iter()
        .map(|row| {
            let row = record(row, &["component", "triggeredBy"])?;
            let component = record(row.get("component").unwrap_or(&Value::Null), &["id"])?;
            let triggered = rows(row.get("triggeredBy"))?
                .iter()
                .map(|value| id(Some(value)))
                .collect::<io::Result<_>>()?;
            Ok((id(component.get("id"))?, triggered))
        })
        .collect::<io::Result<_>>()?;
    Ok(Some(Snaps { snapped, auto }))
}

pub fn snap_error(value: Option<&Value>) -> io::Result<Option<SnapError>> {
    let Some(value) = value else { return Ok(None) };
    if value.get("kind").and_then(Value::as_str) == Some("message") {
        let map = record(value, &["kind", "message"])?;
        return Ok(Some(SnapError {
            components: Vec::new(),
            message: Some(text(map.get("message"))?.to_owned()),
        }));
    }
    let map = record(value, &["kind", "components"])?;
    if map.get("kind").and_then(Value::as_str) != Some("componentsHaveIssues") {
        return Err(decline("native command snap error kind"));
    }
    let components: Vec<(Id, Vec<Vec<String>>)> = rows(map.get("components"))?
        .iter()
        .map(|component| {
            let component = record(component, &["id", "issues"])?;
            let issues = rows(component.get("issues"))?
                .iter()
                .map(packages)
                .collect::<io::Result<Vec<_>>>()?;
            if issues.is_empty() {
                return Err(decline("native command snap issues absent"));
            }
            Ok((id(component.get("id"))?, issues))
        })
        .collect::<io::Result<_>>()?;
    if components.is_empty() {
        return Err(decline("native command snap error components absent"));
    }
    Ok(Some(SnapError { components, message: None }))
}

/// The packages of one `MissingManuallyConfiguredPackages` issue.
fn packages(issue: &Value) -> io::Result<Vec<String>> {
    let issue = record(issue, &["type", "data"])?;
    if issue.get("type").and_then(Value::as_str) != Some("MissingManuallyConfiguredPackages") {
        return Err(decline("native command snap issue type"));
    }
    let data: Value = serde_json::from_str(text(issue.get("data"))?)
        .map_err(|_| decline("native command snap issue packages"))?;
    let names = array(Some(&data), "snap issue packages")?
        .iter()
        .map(|name| text(Some(name)).map(str::to_string))
        .collect::<io::Result<Vec<_>>>()?;
    if names.is_empty() {
        return Err(decline("native command snap issue packages"));
    }
    Ok(names)
}

impl Snaps {
    /// `Total Snapped`.
    pub fn count(&self) -> usize {
        self.snapped.len() + self.auto.len()
    }

    /// `getSnapsOutput` without an error.
    pub fn section(&self, format: &Formatter) -> String {
        let items: Vec<String> = self.snapped
            .iter()
            .map(|component| {
                let mut line = format.item(&component.display());
                let auto: Vec<String> = self.auto
                    .iter()
                    .filter(|(_, triggered)| {
                        triggered
                            .iter()
                            .any(|id| id.same_without_version(component))
                    })
                    .map(|(id, _)| id.display())
                    .collect();
                if !auto.is_empty() {
                    let _ = write!(line, "\n       {AUTO_SNAPPED}: {}", auto.join(", "));
                }
                line
            })
            .collect();
        format.section(
            "merge-snapped components",
            "components snapped as a result of the merge",
            &items,
        )
    }
}

impl SnapError {
    /// `getSnapsOutput` with `mergeSnapError`.
    pub fn section(&self, format: &Formatter) -> String {
        let chalk = format.chalk;
        let title = format.title(&format!("{} snap error", format.error_symbol()));
        let failed = chalk.red(
            "snapping merged components failed with the following error, please fix the issues and snap manually",
        );
        format!("{title}\n{failed}\n{}", self.message(format))
    }

    /// `ComponentsHaveIssues.message`.
    fn message(&self, format: &Formatter) -> String {
        if let Some(message) = &self.message {
            return message.clone();
        }
        let chalk = format.chalk;
        let title = chalk.yellow(&format!(
            "\n       {}: \n",
            r#"missing packages that were manually set  (run "bit install")"#,
        ));
        let components: Vec<String> = self.components
            .iter()
            .map(|(id, issues)| {
                let mut text = format!("{}\n       ", chalk.underline(&chalk.cyan(&id.display())));
                for packages in issues {
                    let data = chalk.white(&format!("{ISSUE_SPACE}{}", packages.join(", ")));
                    let _ = write!(text, "{title}{data}");
                }
                text.push('\n');
                text
            })
            .collect();
        format!(
            "error: issues found with the following components\n\n{}\n\nto get the list of component-issues names and suggestions how to resolve them, run \"bit component-issues\".\n",
            components.join("\n"),
        )
    }
}
