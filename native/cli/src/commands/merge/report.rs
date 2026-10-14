//! The merge report: `mergeReport` of `@teambit/merging`, with the fields
//! the glue forwards for `bit merge` (`MergeCmd`'s projection): components,
//! skipped components, the version, the snapshot results and `verbose`.
//! Removed components and unresolved conflicts are not forwarded, so their
//! sections stay empty.

use super::options::Options;
use crate::commands::{
    color::Chalk,
    workspace_command::{
        format::Formatter,
        results::{Report, Results, hydrate},
    },
};
use serde_json::Value;
use std::io;

/// `compHasBeenRemovedMsg`.
const REMOVED: &str = "component has been removed";

pub fn format(result: &Value, options: &Options, chalk: Chalk) -> io::Result<Report> {
    let results = hydrate(result)?;
    let report = Merge { results: &results, options, format: Formatter::new(chalk) };
    let others = report.other_skipped();
    let hidden = !others.is_empty() && !options.verbose;
    let detailed = report.join(&report.skipped_detailed());
    if !hidden {
        return Ok(Report { data: detailed, code: 0, details: None });
    }
    let hint =
        report.format.details_hint(&format!("full list of {} skipped component(s)", others.len()));
    Ok(Report { data: report.join(&hint), code: 0, details: Some(detailed) })
}

struct Merge<'r> {
    results: &'r Results,
    options: &'r Options,
    format: Formatter,
}

impl Merge<'_> {
    /// The sections around the skipped list.
    fn join(&self, skipped: &str) -> String {
        Formatter::join(&[
            self.success(),
            self.skipped_removed(),
            skipped.to_string(),
            self.snaps(),
            self.summary(),
        ])
    }

    fn chalk(&self) -> Chalk {
        self.format.chalk
    }

    /// `getSuccessOutput`.
    fn success(&self) -> String {
        let count = self.results.components.len();
        if count == 0 {
            return String::new();
        }
        let version = self.results.version
            .as_deref()
            .filter(|version| !version.is_empty())
            .map_or_else(String::new, |version| {
                format!(" from version {}", self.chalk().bold(version))
            });
        let title = self.format.title(&format!("successfully merged {count} components{version}"));
        let changes = self.results.apply_version_report(&self.format, true, false);
        if changes.is_empty() { title } else { format!("{title}\n{changes}") }
    }

    /// `getSkippedRemovedOutput`.
    fn skipped_removed(&self) -> String {
        let items: Vec<String> = self.results.skipped
            .iter()
            .filter(|(_, message)| message == REMOVED)
            .map(|(id, _)| {
                Formatter::item_with(&self.chalk().bold(&id.display()), &self.format.warn_symbol())
            })
            .collect();
        if items.is_empty() {
            return String::new();
        }
        let section = self.format.section("merge skipped - soft-removed", "", &items);
        let hint = self.format.hint(
            r#"use "bit recover <component-id>" to restore, then re-run the merge"#,
        );
        format!("{section}\n{hint}")
    }

    fn other_skipped(&self) -> Vec<&(crate::commands::ids::Id, String)> {
        self.results.skipped
            .iter()
            .filter(|(_, message)| message != REMOVED)
            .collect()
    }

    /// `getFailureOutputDetailed`.
    fn skipped_detailed(&self) -> String {
        let items: Vec<String> = self
            .other_skipped()
            .iter()
            .map(|(id, message)| {
                self.format.item(&format!("{} - {message}", self.chalk().bold(&id.display())))
            })
            .collect();
        self.format.section("merge skipped", "", &items)
    }

    /// `getSnapsOutput`.
    fn snaps(&self) -> String {
        if let Some(error) = &self.results.snap_error {
            return error.section(&self.format);
        }
        self.results.snaps
            .as_ref()
            .map_or_else(String::new, |snaps| snaps.section(&self.format))
    }

    /// `getSummary`.
    fn summary(&self) -> String {
        let bold = |text: &str| self.chalk().bold(text);
        let _ = self.options;
        format!(
            "{}\nTotal Merged: {}\nTotal Unchanged: {}\nTotal Snapped: {}\nTotal Removed: {}\nConflicts: {}",
            self.format.title("Merge Summary"),
            bold(&self.results.components.len().to_string()),
            bold(&self.results.skipped.len().to_string()),
            bold(&self.results.snapped_count().to_string()),
            bold("0"),
            bold("none"),
        )
    }
}
