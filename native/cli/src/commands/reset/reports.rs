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
