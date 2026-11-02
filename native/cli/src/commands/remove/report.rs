//! The local sections of `RemoveTemplate`, including successful partial removals.
//!
//! [`render`] formats removed ([`removed_section`]), lane, and modified component sections using [`Formatter`].
use crate::commands::workspace_command::format::Formatter;

/// Renders the workspace, lane, and modified component sections of `RemoveTemplate`.
#[inline]
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
/// Formats the section listing components removed from `location` (`workspace` or `lane`).
fn removed_section(format: &Formatter, ids: &[String], location: &str) -> String {
    let location = location.trim();
    if ids.is_empty() || location.is_empty() {
        return String::new();
    }
    let items: Vec<String> = unique_ids(ids)
        .into_iter()
        .map(|id| format.item(id))
        .collect();
    if items.is_empty() {
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
/// Formats the error section listing modified components skipped because `--force` was not passed.
fn modified_section(format: &Formatter, ids: &[String]) -> String {
    if ids.is_empty() {
        return String::new();
    }
    let error_symbol = format.error_symbol();
    let items: Vec<String> = unique_ids(ids)
        .into_iter()
        .map(|id| Formatter::item_with(id, &error_symbol))
        .collect();
    if items.is_empty() {
        return String::new();
    }
    format!(
        "{error_symbol} {}\n{}",
        format.title("unable to remove modified components (use --force to remove)"),
        items.join("\n"),
    )
}
/// Strips `@version` suffixes and leading/trailing slashes from `ids`, preserving first-seen order without duplicates.
#[inline]
fn unique_ids(ids: &[String]) -> Vec<&str> {
    let mut out = Vec::with_capacity(ids.len());
    for id in ids
        .iter()
        .map(|id| {
            let trimmed = id.trim().trim_matches('/');
            match trimmed.rsplit_once('@') {
                Some((prefix, _)) if !prefix.trim().is_empty() => prefix.trim().trim_matches('/'),
                _ => trimmed,
            }
        })
        .filter(|id| !id.is_empty())
    {
        if !out.contains(&id) {
            out.push(id);
        }
    }
    out
}
