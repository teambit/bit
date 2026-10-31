//! `getWsConfigUpdateLogs` and `getWorkspaceConfigUpdateOutput`.
use crate::commands::{
    color::Chalk,
    status::js::{array, decline, object, text},
    workspace_command::format::Formatter,
};
use serde_json::Value;
use std::io;

pub(crate) fn format(value: Option<&Value>, chalk: Chalk) -> io::Result<(String, String)> {
    let Some(value) = value.filter(|value| !value.is_null()) else {
        return Ok((String::new(), String::new()));
    };
    let formatter = Formatter::new(chalk);
    let logs = array(value.get("logs"), "checkout workspace policy logs")?
        .iter()
        .map(|line| text(Some(line)))
        .collect::<io::Result<Vec<_>>>()?;
    let logs = if logs.is_empty() {
        String::new()
    } else {
        format!(
            "{}\n{}",
            formatter.title("verbose logs of workspace config update"),
            logs.join("\n"),
        )
    };
    let updates = updates(value.get("workspaceDepsUpdates"), &formatter)?;
    let conflicts = match value.get("workspaceDepsConflicts") {
        None | Some(Value::Null) => String::new(),
        Some(conflicts) if conflicts.is_object() => {
            chalk.yellow("workspace.jsonc has conflicts, please edit the file and fix them")
        }
        Some(_) => return Err(decline("checkout workspace dependency conflicts")),
    };
    Ok((logs, Formatter::join(&[updates, conflicts])))
}

fn updates(value: Option<&Value>, formatter: &Formatter) -> io::Result<String> {
    let Some(value) = value.filter(|value| !value.is_null()) else {
        return Ok(String::new());
    };
    let rows = object(value)?
        .iter()
        .filter(|(name, _)| !name.trim().is_empty())
        .map(|(name, entry)| {
            let name = name.trim();
            let (before, after) = update_pair(entry)?;
            Ok(format!("  {name}: {before} => {after}"))
        })
        .collect::<io::Result<Vec<_>>>()?;
    if rows.is_empty() {
        return Ok(String::new());
    }
    Ok(format!(
        "{}\n{}",
        formatter.title("workspace.jsonc has been updated with the following dependencies"),
        rows.join("\n"),
    ))
}

fn update_pair(value: &Value) -> io::Result<(&str, &str)> {
    if let Some(object) = value.as_object() {
        let before = text(
            object
                .get("from")
                .or_else(|| object.get("oldVersion")),
        )?;
        let after = text(
            object
                .get("to")
                .or_else(|| object.get("newVersion")),
        )?;
        return Ok((before, after));
    }
    let row = array(Some(value), "checkout workspace dependency update")?;
    if row.len() != 2 {
        return Err(decline("checkout workspace dependency versions"));
    }
    Ok((text(Some(&row[0]))?, text(Some(&row[1]))?))
}
