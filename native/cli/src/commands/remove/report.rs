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
    let items: Vec<String> = ids
        .iter()
        .map(|id| id.trim())
        .filter(|id| !id.is_empty())
        .map(|id| format.item(id))
        .collect();
    if items.is_empty() {
        return String::new();
    }
    let location = location.trim();
    format!(
        "{}\n{}",
        format.success_summary(&format!(
            "successfully removed components from the local {location}"
        )),
        items.join("\n"),
    )
}
fn modified_section(format: &Formatter, ids: &[String]) -> String {
    let items: Vec<String> = ids
        .iter()
        .map(|id| id.trim())
        .filter(|id| !id.is_empty())
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
