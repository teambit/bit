use super::{Formatter, Plan, options::Options};
pub(super) fn render(plan: &Plan, options: &Options<'_>, undo: bool, format: &Formatter) -> String {
    let changed = plan.changed();
    let unchanged = plan.unchanged();
    let verb = if undo { "undeprecated" } else { "deprecated" };
    let unchanged_state = if undo { "not currently deprecated" } else { "already deprecated" };
    if let Some(report) = range_report(plan, options, verb, unchanged_state, format) {
        return report;
    }
    if changed.len() == 1 && unchanged.is_empty() {
        return format.success_summary(&format!(
            r#"the component "{}" has been {verb} successfully"#,
            changed[0],
        ));
    }
    if changed.is_empty() {
        return format.hint(&format!(
            r#"all {} component(s) matching "{}" are {unchanged_state}. no changes have been made"#,
            unchanged.len(),
            options.pattern.trim(),
        ));
    }
    sections(changed, unchanged, undo, verb, format)
}
fn sections(
    changed: &[String],
    unchanged: &[String],
    undo: bool,
    verb: &str,
    format: &Formatter,
) -> String {
    Formatter::join(&[
        format.success_summary(&format!(
            "{} component(s) have been {verb} successfully",
            changed.len(),
        )),
        format.section(
            verb,
            "",
            &changed
                .iter()
                .map(|id| format.item(id))
                .collect::<Vec<_>>(),
        ),
        format.section(
            if undo { "not deprecated" } else { "already deprecated" },
            "no changes were made to these",
            &unchanged
                .iter()
                .map(|id| format.item(id))
                .collect::<Vec<_>>(),
        ),
    ])
}

fn range_report(
    plan: &Plan,
    options: &Options<'_>,
    verb: &str,
    unchanged_state: &str,
    format: &Formatter,
) -> Option<String> {
    let range = options.range
        .map(str::trim)
        .filter(|value| !value.is_empty())?;
    format_range_summary(plan.changed(), plan.unchanged(), range, verb, unchanged_state, format)
}

fn format_range_summary(
    changed: &[String],
    unchanged: &[String],
    range: &str,
    verb: &str,
    unchanged_state: &str,
    format: &Formatter,
) -> Option<String> {
    if changed.len() == 1 && unchanged.is_empty() {
        return Some(format.success_summary(&format!(
            r#"versions of "{}" matching the range "{range}" have been {verb} successfully"#,
            changed[0],
        )));
    }
    if changed.is_empty() && unchanged.len() == 1 {
        return Some(format.hint(&format!(
            r#"the range "{range}" of "{}" is {unchanged_state}. no changes have been made"#,
            unchanged[0],
        )));
    }
    None
}
