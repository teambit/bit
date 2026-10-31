//! Published `removeTemplate` for remote hard-delete receipts.

use crate::commands::{color::Chalk, workspace_command::format::Formatter};
use serde_json::Value;

pub(super) fn components(receipts: &[Value], chalk: Chalk) -> String {
    let format = Formatter::new(chalk);
    receipts
        .iter()
        .map(|receipt| component(receipt, &format))
        .collect::<Vec<_>>()
        .join(",")
}

fn component(receipt: &Value, format: &Formatter) -> String {
    let dependent = dependents(receipt, format);
    let removed = section(
        &list(&receipt["removedComponentIds"]),
        "successfully removed components from the remote scope",
        format,
    );
    let lane = section(
        &list(&receipt["removedFromLane"]),
        "successfully removed components from the remote lane",
        format,
    );
    let missing = missing(receipt, format);
    Formatter::join(&[dependent, removed, lane, missing])
}

fn dependents(receipt: &Value, format: &Formatter) -> String {
    let Some(rows) = receipt["dependentBits"].as_object() else { return String::new() };
    rows.iter()
        .map(|(id, dependencies)| dependent_row(id, dependencies, format))
        .collect::<Vec<_>>()
        .join("\n\n")
}

fn dependent_row(id: &str, dependencies: &Value, format: &Formatter) -> String {
    let id = id.trim();
    let symbol = format.error_symbol();
    let body = list(dependencies)
        .iter()
        .map(|dependency| Formatter::item_with(dependency, &symbol))
        .collect::<Vec<_>>()
        .join("\n");
    format!(
        "{symbol} {}\n{body}",
        format.title(&format!(
            "unable to delete {id}, because the following components depend on it",
        )),
    )
}

fn missing(receipt: &Value, format: &Formatter) -> String {
    let missing = list(&receipt["missingComponents"]);
    if missing.is_empty() {
        String::new()
    } else {
        let symbol = format.error_symbol();
        let rows = missing
            .iter()
            .map(|id| Formatter::item_with(strip_latest_or_head(id), &symbol))
            .collect::<Vec<_>>()
            .join("\n");
        format!("{symbol} {}\n{rows}", format.title("missing components"))
    }
}

fn section(ids: &[String], title: &str, format: &Formatter) -> String {
    if ids.is_empty() {
        return String::new();
    }
    format!(
        "{}\n{}",
        format.success_summary(title),
        ids.iter()
            .map(|id| format.item(strip_latest_or_head(id)))
            .collect::<Vec<_>>()
            .join("\n"),
    )
}

fn strip_latest_or_head(id: &str) -> &str {
    let id = id.trim();
    id.strip_suffix("@latest")
        .or_else(|| id.strip_suffix("@head"))
        .unwrap_or(id)
}

fn list(value: &Value) -> Vec<String> {
    value
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(Value::as_str)
        .map(str::trim)
        .filter(|val| !val.is_empty())
        .map(str::to_owned)
        .collect()
}

pub(super) fn lanes(receipts: &[Value], chalk: Chalk) -> String {
    let ids = receipts
        .iter()
        .flat_map(|receipt| list(&receipt["removedLanes"]))
        .collect::<Vec<_>>();
    chalk.green(&format!(
        "successfully removed the following lane(s): {}",
        chalk.bold(&ids.join(", ")),
    ))
}
