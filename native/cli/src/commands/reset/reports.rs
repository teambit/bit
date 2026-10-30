//! Canonical reset summaries.
use crate::commands::{
    color::Chalk,
    workspace_command::{format::Formatter, results::Report},
};
use bit_object_import::reset_soft::Plan as SoftPlan;
use std::ffi::OsString;

pub(super) fn soft_report(args: &[OsString], plan: &SoftPlan) -> Report {
    let formatter = Formatter::new(Chalk::detect(args));
    let items: Vec<_> = plan.entries
        .iter()
        .map(|entry| {
            formatter.item(&format!(
                "{} - version(s): {}",
                formatter.chalk.cyan(&entry.identity),
                entry.version,
            ))
        })
        .collect();
    let count = items.len();
    Report {
        data: Formatter::join(&[
            formatter.section(
                "soft-untagged components",
                "soft-untagged versions are no longer candidates for tagging",
                &items,
            ),
            formatter.success_summary(&format!("{count} component(s) soft-untagged successfully")),
        ]),
        code: 0,
        details: None,
    }
}

pub(super) fn report(args: &[OsString], identity: &str, labels: &[String]) -> Report {
    let formatter = Formatter::new(Chalk::detect(args));
    let item = formatter.item(&format!(
        "{} - version(s): {}",
        formatter.chalk.cyan(identity),
        labels.join(", "),
    ));
    Report {
        data: Formatter::join(&[
            formatter.section("reset components", "", &[item]),
            formatter.success_summary("1 component(s) reset successfully"),
        ]),
        code: 0,
        details: None,
    }
}

/// Format a multi-component reset report from `(identity, version_labels)` pairs.
pub(super) fn batch_report<'a>(
    args: &[OsString],
    results: impl Iterator<Item = (&'a str, &'a [String])>,
) -> Report {
    let formatter = Formatter::new(Chalk::detect(args));
    let items: Vec<_> = results
        .map(|(identity, labels)| {
            formatter.item(&format!(
                "{} - version(s): {}",
                formatter.chalk.cyan(identity),
                labels.join(", "),
            ))
        })
        .collect();
    let count = items.len();
    Report {
        data: Formatter::join(&[
            formatter.section("reset components", "", &items),
            formatter.success_summary(&format!("{count} component(s) reset successfully")),
        ]),
        code: 0,
        details: None,
    }
}

pub(super) fn never_exported_report(args: &[OsString], labels: &[String]) -> Report {
    let formatter = Formatter::new(Chalk::detect(args));
    let items = labels
        .iter()
        .map(|label| formatter.item(label))
        .collect::<Vec<_>>();
    let count = items.len();
    Report {
        data: Formatter::join(&[
            formatter.section("reset never-exported components", "", &items),
            formatter.success_summary(&format!(
                "successfully reset {count} never-exported component(s)",
            )),
        ]),
        code: 0,
        details: None,
    }
}
