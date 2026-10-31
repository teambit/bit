//! The local sections of `RemoveTemplate`, including successful partial removals.
use crate::commands::workspace_command::format::Formatter;

pub(super) fn render(
    format: &Formatter,
    removed: &[String],
    lane: &[String],
    modified: &[String],
) -> String {
    Formatter::join(&[
        removed_section(format, removed, "workspace"),
        removed_section(format, lane, "lane"),
        modified_section(format, modified),
    ])
}
fn removed_section(format: &Formatter, ids: &[String], location: &str) -> String {
    let items: Vec<String> = unique_ids(ids)
        .into_iter()
        .map(|id| format.item(id))
        .collect();
    let location = location.trim();
    if items.is_empty() || location.is_empty() {
        return String::new();
    }
    format!(
        "{}\n{}",
        format.success_summary(&format!(
            "successfully removed components from the local {location}"
        )),
        items.join("\n"),
    )
}
fn modified_section(format: &Formatter, ids: &[String]) -> String {
    let items: Vec<String> = unique_ids(ids)
        .into_iter()
        .map(|id| Formatter::item_with(id, &format.error_symbol()))
        .collect();
    if items.is_empty() {
        return String::new();
    }
    format!(
        "{} {}\n{}",
        format.error_symbol(),
        format.title("unable to remove modified components (use --force to remove)"),
        items.join("\n"),
    )
}
fn unique_ids(ids: &[String]) -> Vec<&str> {
    let mut out = Vec::with_capacity(ids.len());
    for id in ids
        .iter()
        .map(|id| id.trim())
        .filter(|id| !id.is_empty())
    {
        if !out.contains(&id) {
            out.push(id);
        }
    }
    out
}
