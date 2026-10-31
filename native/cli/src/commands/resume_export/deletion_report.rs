//! `ResumeExportCmd` pending-object probe, deletion, race and failure reports.
use super::deletion::Answers;
use crate::commands::workspace_command::format::Formatter;
use indexmap::IndexMap;
use std::io;

pub(super) fn failed_lines(failed: &IndexMap<String, String>) -> Vec<String> {
    failed
        .iter()
        .map(|(name, message)| {
            let trimmed_name = name.trim();
            let trimmed_msg = message.trim();
            if trimmed_msg.is_empty() {
                trimmed_name.to_owned()
            } else {
                format!("{trimmed_name} - {trimmed_msg}")
            }
        })
        .collect()
}

fn failed_section(formatter: &Formatter, failed: &IndexMap<String, String>) -> String {
    formatter.section(
        &format!("{} failed scopes", formatter.error_symbol()),
        "(these scopes could not be reached, nothing was deleted from them)",
        &failed_lines(failed)
            .iter()
            .map(|line| Formatter::item_with(line, &formatter.error_symbol()))
            .collect::<Vec<_>>(),
    )
}

fn warning(formatter: &Formatter, message: &str) -> String {
    format!("{} {}", formatter.warn_symbol(), formatter.chalk.yellow(message))
}

pub(super) fn nothing(formatter: &Formatter, export_id: &str, probe: &Answers) -> String {
    let message = format!(r#"no pending objects of "{export_id}" were found, nothing to delete"#);
    Formatter::join(&[
        failed_section(formatter, &probe.failed),
        if probe.failed.is_empty() {
            formatter.success_summary(&message)
        } else {
            warning(formatter, &format!("{message} on the scopes that answered"))
        },
    ])
}

pub(super) fn probe(
    formatter: &Formatter,
    export_id: &str,
    probe: &Answers,
    to_clear: &[String],
) -> String {
    Formatter::join(&[
        formatter.section("pending objects to delete", &format!(r#"(of the export-id "{export_id}")"#), &to_clear.iter().map(|name| formatter.item(name)).collect::<Vec<_>>()),
        formatter.section(&format!("{} scopes that no longer hold these objects", formatter.warn_symbol()),
            "a scope drops the pending objects as soon as it persisted them, so this export may be\npartially persisted already. if it is, deleting the rest leaves these scopes with\ndependencies that were never exported. run without \"--delete\" to persist instead.",
            &probe.absent.iter().map(|name| Formatter::item_with(name, &formatter.warn_symbol())).collect::<Vec<_>>()),
        if probe.unknown.is_empty() { String::new() } else {
            warning(formatter, &format!("{} scope(s) run a server that can't report whether anything is pending, so the check above skipped them", probe.unknown.len()))
        },
        failed_section(formatter, &probe.failed),
    ])
}

pub(super) fn result(
    formatter: &Formatter,
    export_id: &str,
    probe: &Answers,
    result: Answers,
) -> io::Result<String> {
    let mut failed = probe.failed.clone();
    failed.extend(result.failed);
    let cleared = result.present.len() + result.unknown.len();
    if cleared == 0 && result.absent.is_empty() {
        return Err(io::Error::other(format!(
            "failed removing the pending objects of \"{export_id}\" from all the given scopes:\n{}",
            failed_lines(&failed).join("\n"),
        )));
    }
    let message =
        format!(r#"deleted the pending objects of "{export_id}" from {cleared} scope(s)"#);
    let summary = if !failed.is_empty() {
        warning(formatter, &format!("{message}, {} failed", failed.len()))
    } else if cleared == 0 {
        formatter.success_summary("nothing was pending anymore, no objects were deleted")
    } else {
        formatter.success_summary(&message)
    };
    let untouched = probe.absent.len() + result.absent.len();
    let changed: Vec<_> = probe.present
        .iter()
        .filter(|name| result.absent.contains(name))
        .map(|name| Formatter::item_with(name, &formatter.warn_symbol()))
        .collect();
    Ok(Formatter::join(&[
        formatter.section(&format!("{} scopes that changed while this command ran", formatter.warn_symbol()),
            "these scopes held the pending objects during the check but not during the deletion.\nsomething else persisted or removed them in between, so this export may now be\npartially persisted. verify it before relying on the result above.", &changed),
        failed_section(formatter, &failed), summary,
        if untouched == 0 { String::new() } else { formatter.hint(&format!("({untouched} scope(s) had nothing pending and were left untouched)")) },
    ]))
}
