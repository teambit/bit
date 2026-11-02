//! Published `removeTemplate` ([`Formatter`], [`Chalk`]) for remote hard-delete receipts.
//!
//! Formats [`components`] output sections for removed, lane-removed, dependent, and missing IDs.

use crate::commands::{color::Chalk, workspace_command::format::Formatter};
use serde_json::Value;

/// Formats all remote hard-delete `receipts` into the human-readable terminal report.
#[inline]
pub(super) fn components(receipts: &[Value], chalk: Chalk) -> String {
    let format = Formatter::new(chalk);
    receipts
        .iter()
        .map(|receipt| component(receipt, &format))
        .filter(|text| !text.is_empty())
        .collect::<Vec<_>>()
        .join(",")
}

/// Formats a single remote hard-delete `receipt` into dependent, removed, lane, and missing sections.
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

/// Formats the `dependentBits` blocker section of a remote hard-delete `receipt`.
fn dependents(receipt: &Value, format: &Formatter) -> String {
    let Some(rows) = receipt["dependentBits"].as_object() else { return String::new() };
    rows.iter()
        .filter_map(|(id, dependencies)| {
            let deps = list(dependencies);
            (!deps.is_empty()).then(|| dependent_row(id, &deps, format))
        })
        .collect::<Vec<_>>()
        .join("\n\n")
}

/// Formats a single dependent-blocker block for `id` and its blocking `dependencies`.
fn dependent_row(id: &str, dependencies: &[String], format: &Formatter) -> String {
    let id = strip_latest_or_head(id);
    let symbol = format.error_symbol();
    let body = dependencies
        .iter()
        .map(|dependency| Formatter::item_with(strip_latest_or_head(dependency), &symbol))
        .collect::<Vec<_>>()
        .join("\n");
    format!(
        "{symbol} {}\n{body}",
        format.title(&format!(
            "unable to delete {id}, because the following components depend on it",
        )),
    )
}

/// Formats the `missingComponents` error section of a remote hard-delete `receipt`.
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

#[inline]
fn strip_latest_or_head(id: &str) -> &str {
    let id = id.trim();
    id.strip_suffix("@latest")
        .or_else(|| id.strip_suffix("@head"))
        .unwrap_or(id)
}

#[inline]
fn list(value: &Value) -> Vec<String> {
    value
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(receipt_entry_id)
        .collect()
}

fn receipt_entry_id(entry: &Value) -> Option<String> {
    if let Some(raw) = entry
        .as_str()
        .or_else(|| entry["id"].as_str())
    {
        let trimmed = raw.trim();
        return (!trimmed.is_empty()).then(|| trimmed.to_owned());
    }
    let name = entry["name"]
        .as_str()
        .or_else(|| entry["id"]["name"].as_str())
        .map(str::trim)
        .filter(|name| !name.is_empty())?;
    let scope = entry["scope"]
        .as_str()
        .or_else(|| entry["id"]["scope"].as_str())
        .map(str::trim)
        .filter(|scope| !scope.is_empty());
    Some(match scope {
        Some(scope) => format!("{scope}/{name}"),
        None => name.to_owned(),
    })
}

#[inline]
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
