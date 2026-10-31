//! `getWorkspaceConfigUpdateOutput` for lane merges.
use crate::commands::{
    color::Chalk,
    status::js::{array, object, text},
    workspace_command::format::Formatter,
};
use serde_json::Value;
use std::io;

pub(super) fn format(value: Option<&Value>, chalk: Chalk) -> io::Result<String> {
    let Some(value) = value.filter(|value| !value.is_null()) else { return Ok(String::new()) };
    let formatter = Formatter::new(chalk);
    let unchanged = section(value.get("workspaceDepsUnchanged"), &formatter, false)?;
    let updates = section(value.get("workspaceDepsUpdates"), &formatter, true)?;
    let conflicts = if value
        .get("workspaceDepsConflicts")
        .is_some_and(|conflicts| !conflicts.is_null())
    {
        chalk.yellow("workspace.jsonc has conflicts, please edit the file and fix them")
    } else {
        String::new()
    };
    Ok(Formatter::join(&[unchanged, updates, conflicts]))
}

fn section(value: Option<&Value>, formatter: &Formatter, updates: bool) -> io::Result<String> {
    let Some(value) = value.filter(|value| !value.is_null()) else { return Ok(String::new()) };
    let rows = object(value)?
        .iter()
        .map(|(name, value)| {
            let value = if updates { update_pair(value)? } else { text(Some(value))?.to_owned() };
            Ok(format!("  {name}: {value}"))
        })
        .collect::<io::Result<Vec<_>>>()?;
    let title = if updates {
        "workspace.jsonc has been updated with the following dependencies"
    } else {
        "workspace.jsonc was unable to update the following dependencies"
    };
    Ok(format!("{}\n{}", formatter.title(title), rows.join("\n")))
}

fn update_pair(value: &Value) -> io::Result<String> {
    if let Some(from) = value
        .get("from")
        .or_else(|| value.get("oldVersion"))
    {
        let to = value
            .get("to")
            .or_else(|| value.get("newVersion"));
        return Ok(format!("{} => {}", text(Some(from))?, text(to)?));
    }
    let pair = array(Some(value), "merge workspace dependency update")?;
    Ok(format!("{} => {}", text(pair.first())?, text(pair.get(1))?))
}

pub(super) fn conflicted(result: &Value, lane: bool) -> io::Result<Vec<String>> {
    if !lane {
        return Ok(Vec::new());
    }
    result["configMergeResults"]
        .as_array()
        .into_iter()
        .flatten()
        .filter(|row| row["hasConflicts"] == true)
        .map(|row| {
            text(
                row.get("compIdStr")
                    .or_else(|| row.get("id"))
                    .or_else(|| row.get("componentId")),
            )
            .map(|id| id.trim().to_owned())
        })
        .collect()
}

pub(super) fn conflict_section(ids: &[String], formatter: &Formatter) -> String {
    if ids.is_empty() {
        return String::new();
    }
    let title = formatter.title(&format!(
        "{} components with config-merge conflicts",
        formatter.warn_symbol(),
    ));
    let suggestion = formatter.hint("conflicts were found while trying to merge the config. fix them manually by editing the merge-conflict file in the workspace root.\nonce ready, snap/tag the components to complete the merge.");
    format!("{title}\n{}\n{suggestion}", ids.join("\n"))
}
