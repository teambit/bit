//! Human-readable summary report formatting for `bit scope rename`.
//!
//! [`render`] and [`section`] format renamed [`Batch`] entries and refactored component IDs for [`Options`] with [`Formatter`].
use crate::commands::workspace_command::format::Formatter;
use bit_object_import::component_scope_rename::{Batch, Options};
use std::io;
/// Formats the human-readable summary and affected/refactored component sections for `bit scope rename`.
pub(super) fn render(
    batch: &Batch,
    options: &Options,
    refactored: &[String],
    format: &Formatter,
) -> io::Result<String> {
    let kind = if options.owner { "owner" } else { "scope" };
    let summary = format.success_summary(&format!(
        r#"replaced "{}" {kind} with "{}""#,
        options.old.trim(),
        options.new.trim(),
    ));
    let mut affected = Vec::with_capacity(batch.len());
    for index in 0..batch.len() {
        let plan = batch.plan(index)?;
        let source = plan.identity.source
            .trim()
            .rsplit_once('@')
            .filter(|(base, _)| !base.trim().is_empty())
            .map_or_else(|| plan.identity.source.trim(), |(base, _)| base.trim());
        affected.push(format.item(&format!(
            "{source} {}-> {}",
            if plan.identity.exported { "(deprecated) " } else { "" },
            plan.identity.target.trim(),
        )));
    }
    let mut seen = Vec::with_capacity(refactored.len());
    for id in refactored
        .iter()
        .map(|id| id.trim().trim_matches('/'))
        .filter(|id| !id.is_empty())
    {
        if !seen.contains(&id) {
            seen.push(id);
        }
    }
    let changed = seen
        .into_iter()
        .map(|id| format.item(id))
        .collect::<Vec<_>>();
    Ok(Formatter::join(&[
        summary,
        section("affected components", &affected, format),
        section("refactored components", &changed, format),
    ]))
}
/// Formats a titled report section with item count when `rows` is non-empty.
#[inline]
fn section(name: &str, rows: &[String], format: &Formatter) -> String {
    let name = name.trim();
    if rows.is_empty() || name.is_empty() {
        return String::new();
    }
    let title = format.title(&format!("{name} ({})", rows.len()));
    format!("{title}\n{}", rows.join("\n"))
}
