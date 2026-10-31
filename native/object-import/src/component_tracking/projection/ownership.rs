use super::{Plan, error};
use serde_json::Value;
use std::io;
pub(super) fn validate(
    plan: &Plan,
    directory: &str,
    name: &str,
    added_scope: &str,
) -> io::Result<()> {
    let Some(rows) = plan.bitmap.as_object() else {
        return Err(error("invalid component bitmap"));
    };
    for (owner, row) in rows {
        let Some(parent) = row["rootDir"]
            .as_str()
            .map(str::trim)
            .filter(|dir| !dir.is_empty())
        else {
            continue;
        };
        let owner_name = super::rows::row_name(owner, row).unwrap_or(owner);
        let scope = super::rows::scope(row).unwrap_or_default();
        if parent == "." {
            root_owner(row, owner_name, scope, directory, name, added_scope)?;
        }
        if parent != "." && directory.starts_with(&format!("{parent}/")) {
            let directory = super::super::paths::diagnostic(directory);
            return Err(error(format!(
                "components can't be nested under other components. unable to create a component in directory \"{directory}\" which is nested under component \"{scope}/{owner_name}\".\nusing 'bit create', choose a different path with the '--path' flag or if using 'bit add' put the component in a different directory",
            )));
        }
    }
    Ok(())
}

fn root_owner(
    row: &Value,
    owner: &str,
    scope: &str,
    directory: &str,
    name: &str,
    added_scope: &str,
) -> io::Result<()> {
    if !super::super::active(row) {
        return Ok(());
    }
    let tracked_name = row["name"]
        .as_str()
        .map(str::trim)
        .filter(|val| !val.is_empty())
        .unwrap_or(owner);
    if directory == "." && name != tracked_name {
        return Err(error(format!(
            r#"unable to track the workspace root, it is already tracked by "{scope}/{owner}""#,
        )));
    }
    if directory != "." && contains_root_main_file(row, directory) {
        return Err(error(format!(
            r#"unable to add "{directory}" as "{added_scope}/{name}", it contains "{}", the main file of the workspace-root component "{scope}/{owner}". set a different main file for it first: bit add . --main workspace.jsonc"#,
            row["mainFile"].as_str().map_or("", str::trim),
        )));
    }
    Ok(())
}

fn contains_root_main_file(row: &Value, directory: &str) -> bool {
    row["mainFile"]
        .as_str()
        .map(str::trim)
        .filter(|main| !main.is_empty())
        .is_some_and(|main| {
            main.to_lowercase()
                .starts_with(&format!("{}/", directory.trim().to_lowercase()))
        })
}
