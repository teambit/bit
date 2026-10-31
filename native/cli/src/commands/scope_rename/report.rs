use crate::commands::workspace_command::format::Formatter;
use bit_object_import::component_scope_rename::{Batch, Options};
use std::io;
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
    let mut affected = Vec::new();
    for index in 0..batch.len() {
        let plan = batch.plan(index)?;
        affected.push(format.item(&format!(
            "{} {}-> {}",
            plan.identity.source.trim(),
            if plan.identity.exported { "(deprecated) " } else { "" },
            plan.identity.target.trim(),
        )));
    }
    let mut seen = Vec::new();
    for id in refactored
        .iter()
        .map(|id| id.trim())
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
fn section(name: &str, rows: &[String], format: &Formatter) -> String {
    if rows.is_empty() {
        return String::new();
    }
    let mut output = vec![format.title(&format!("{name} ({})", rows.len()))];
    output.extend_from_slice(rows);
    output.join("\n")
}
