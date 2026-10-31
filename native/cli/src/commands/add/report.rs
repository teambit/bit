//! Published `AddCmd.report/json` with exact warning and section order.
use crate::commands::{color::Chalk, workspace_command::format::Formatter};
use serde_json::{Value, json};
use std::io;
pub(super) fn json(components: &[Value], warnings: &Value) -> Value {
    json!({"addedComponents":components.iter().map(|row|json!({"id":row["id"],"files":row["files"]})).collect::<Vec<_>>(),"warnings":warnings})
}
pub(super) fn text(components: &[Value], warnings: &Value, chalk: Chalk) -> io::Result<String> {
    let formatter = Formatter::new(chalk);
    let warning = warning(warnings, &formatter)?;
    if components.len() > 1 {
        return Ok(format!(
            "{warning}{}",
            formatter.success_summary(&format!("tracking {} new components", components.len())),
        ));
    }
    let mut sections = vec![warning];
    for component in components {
        sections.push(component_text(component, &formatter)?);
    }
    Ok(sections
        .into_iter()
        .filter(|text| !text.is_empty())
        .collect::<Vec<_>>()
        .join("\n\n"))
}
fn component_text(component: &Value, formatter: &Formatter) -> io::Result<String> {
    let id = component_id(component)?;
    let files = component["files"]
        .as_array()
        .ok_or_else(|| io::Error::other("tracking component files"))?;
    if files.is_empty() {
        return Ok(format!(
            "{} could not track component {}: no files to track",
            formatter.error_symbol(),
            formatter.chalk.bold(&id),
        ));
    }
    let mut lines =
        vec![formatter.title(&format!("tracking component {}", formatter.chalk.bold(&id)))];
    for file in files {
        let file = file
            .as_str()
            .or_else(|| file["relativePath"].as_str())
            .or_else(|| file["path"].as_str())
            .map(str::trim)
            .filter(|file| !file.is_empty())
            .ok_or_else(|| io::Error::other("tracking file path"))?;
        lines.push(formatter.item(&format!("added {file}")));
    }
    Ok(lines.join("\n"))
}

fn component_id(component: &Value) -> io::Result<String> {
    if let Some(id) = component["id"]
        .as_str()
        .or_else(|| component["identity"].as_str())
        .map(str::trim)
        .filter(|id| !id.is_empty())
    {
        return Ok(id.to_owned());
    }
    let name = component["id"]["name"]
        .as_str()
        .map(str::trim)
        .filter(|name| !name.is_empty())
        .ok_or_else(|| io::Error::other("tracking component identity"))?;
    Ok(component["id"]["scope"]
        .as_str()
        .map(str::trim)
        .filter(|scope| !scope.is_empty())
        .map_or_else(|| name.to_owned(), |scope| format!("{scope}/{name}")))
}
fn warning(value: &Value, format: &Formatter) -> io::Result<String> {
    let mut warning = already_used(value, format)?;
    if let Some(empty) = value["emptyDirectory"]
        .as_array()
        .filter(|rows| !rows.is_empty())
    {
        warning.push_str(&format.title(&format!(
            "{} empty or excluded directories",
            format.warn_symbol(),
        )));
        for directory in empty {
            let directory = directory
                .as_str()
                .map(str::trim)
                .filter(|dir| !dir.is_empty())
                .ok_or_else(|| io::Error::other("tracking empty directory"))?;
            warning.push('\n');
            warning.push_str(&Formatter::item_with(
                &format.chalk.bold(directory),
                &format.warn_symbol(),
            ));
        }
        warning.push('\n');
    }
    Ok(warning)
}

fn already_used(value: &Value, format: &Formatter) -> io::Result<String> {
    let mut result = Vec::new();
    let Some(already) = value["alreadyUsed"].as_object() else {
        return Ok(String::new());
    };
    for (id, files) in already {
        let files = files
            .as_array()
            .ok_or_else(|| io::Error::other("tracking used files"))?
            .iter()
            .map(|file| file.as_str().ok_or_else(|| io::Error::other("tracking used file")))
            .collect::<io::Result<Vec<_>>>()?;
        result.push(Formatter::item_with(
            &format!(
                "files {} already used by component: {id}",
                format.chalk.bold(&files.join(", ")),
            ),
            &format.warn_symbol(),
        ));
    }
    Ok(if result.is_empty() { String::new() } else { format!("{}\n", result.join("\n")) })
}
