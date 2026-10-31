//! `BuilderMain.throwForComponentIssues` filters and formats snapshot blockers.

use crate::commands::{
    color::Chalk,
    status::{
        js::{array, text},
        report::issue_output,
    },
};
use serde_json::Value;
use std::{collections::HashSet, io};

pub(super) fn callbacks(
    resolved: &super::Resolved<'_>,
    rows: &[Value],
    selected: &Value,
    needs_snap: &[String],
    ignored: &Value,
    resolving: bool,
    mut startup: Option<&mut crate::commands::status::autosync::Startup>,
) -> io::Result<()> {
    let selected = array(Some(selected), "snapshot issue selection")?
        .iter()
        .map(|id| text(Some(id)).map(|raw| raw.trim().to_owned()))
        .collect::<io::Result<Vec<_>>>()?;
    let result = callback_batch(resolved, rows, &selected, ignored, resolving);
    if let Some(startup) = startup.as_mut() {
        super::lifecycle::callback_output(
            startup,
            &crate::commands::status::capture::callback_issue_stdout(resolved.capture),
        );
    }
    handled(&result, startup.as_deref_mut());
    result?;
    if let Some(startup) = startup.as_mut()
        && let Some(tail) = startup.snapshot_tail.take()
    {
        startup.snapshot_events.push((tail, String::new()));
    }
    let before = crate::commands::status::capture::callback_issue_stdout(resolved.capture).len();
    let automatic = needs_snap
        .iter()
        .filter(|id| !selected.contains(id))
        .cloned()
        .collect::<Vec<_>>();
    if !automatic.is_empty() {
        let result = callback_batch(resolved, rows, &automatic, ignored, resolving);
        if let Some(startup) = startup.as_mut() {
            super::lifecycle::callback_output(
                startup,
                &crate::commands::status::capture::callback_issue_stdout(resolved.capture)
                    [before..],
            );
        }
        handled(&result, startup);
        result?;
    }
    Ok(())
}

fn handled(
    result: &io::Result<()>,
    startup: Option<&mut crate::commands::status::autosync::Startup>,
) {
    if let Err(error) = result
        && (error.to_string().starts_with("the workspace has the following issues:")
            || error.to_string().starts_with("error: issues found with the following components"))
        && let Some(startup) = startup
    {
        startup.committed = true;
    }
}

fn callback_batch(
    resolved: &super::Resolved<'_>,
    rows: &[Value],
    ids: &[String],
    ignored: &Value,
    resolving: bool,
) -> io::Result<()> {
    let rows = ids
        .iter()
        .filter_map(|id| rows.iter().find(|row| row["id"] == *id))
        .cloned()
        .collect::<Vec<_>>();
    let mut context = resolved.context.clone();
    context["snapshotIgnoreIssues"] = serde_json::json!(
        ignored
            .as_str()
            .unwrap_or_default()
            .split(',')
            .map(str::trim)
            .filter(|name| !name.is_empty())
            .collect::<Vec<_>>()
    );
    let mut rows =
        crate::commands::status::capture::issue_callbacks(&context, resolved.capture, &rows)?;
    if resolving {
        display_ids(&mut rows, resolved.context);
    }
    validate(&rows, ids, ignored)?;
    let messages = crate::commands::status::capture::snapshot_workspace_issues(
        resolved.capture,
        resolved.root,
    )?;
    if messages.is_empty() {
        Ok(())
    } else {
        Err(io::Error::other(format!(
            "the workspace has the following issues:\n{}",
            messages.join("\n"),
        )))
    }
}

pub(super) fn validate(rows: &[Value], selected: &[String], ignored: &Value) -> io::Result<()> {
    let ignored = ignored
        .as_str()
        .unwrap_or_default()
        .split(',')
        .map(str::trim)
        .collect::<HashSet<_>>();
    let chalk = Chalk::detect(&std::env::args_os().collect::<Vec<_>>());
    let mut components = Vec::new();
    for row in rows {
        let id = text(row.get("id"))?.trim();
        if !selected
            .iter()
            .any(|selected| selected.trim() == id)
        {
            continue;
        }
        let blockers = component_blockers(row, &ignored)?;
        if !blockers.is_empty() {
            let display_id = non_empty_field(row, "displayId").unwrap_or(id);
            components.push(format!(
                "{}\n       {}\n",
                chalk.underline(&chalk.cyan(display_id)),
                issue_output(&blockers, chalk),
            ));
        }
    }
    if components.is_empty() {
        return Ok(());
    }
    Err(io::Error::other(format!(
        "error: issues found with the following components\n\n{}\n\nto get the list of component-issues names and suggestions how to resolve them, run \"bit component-issues\".\n",
        components.join("\n"),
    )))
}

fn component_blockers(row: &Value, ignored: &HashSet<&str>) -> io::Result<Vec<Value>> {
    Ok(array(row.get("issues"), "snapshot component issues")?
        .iter()
        .filter(|issue| {
            issue["isTagBlocker"] == true
                && !ignored.contains(issue["type"].as_str().map_or("", str::trim))
        })
        .cloned()
        .collect())
}

fn non_empty_field<'a>(value: &'a Value, key: &str) -> Option<&'a str> {
    value[key]
        .as_str()
        .map(str::trim)
        .filter(|text| !text.is_empty())
}

fn display_ids(rows: &mut [Value], context: &Value) {
    for row in rows {
        let target = context["targets"]
            .as_array()
            .into_iter()
            .flatten()
            .find(|target| target["identity"] == row["id"] || target["id"] == row["id"]);
        let version = target.and_then(|target| {
            non_empty_field(target, "version").or_else(|| non_empty_field(target, "head"))
        });
        if let Some(version) = version
            && let Some(id) = non_empty_field(row, "id")
        {
            row["displayId"] = serde_json::json!(format!("{id}@{version}"));
        }
    }
}
