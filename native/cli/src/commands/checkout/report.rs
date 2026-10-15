//! The checkout report: `checkoutOutput` of `@teambit/checkout`.

use super::options::Options;
use crate::commands::{
    color::Chalk,
    workspace_command::{
        format::Formatter,
        results::{Changed, Report, Results, hydrate, join_lines, listed},
    },
};
use serde_json::Value;
use std::io;

/// The checkout report of the engine's result.
pub fn format(result: &Value, options: &Options, chalk: Chalk) -> io::Result<Report> {
    let results = hydrate(result)?;
    if results.snaps.is_some() || results.snap_error.is_some() {
        return Err(crate::commands::status::js::decline(
            "native checkout report with merge snapshots",
        ));
    }
    let report = Checkout { results: &results, options, format: Formatter::new(chalk) };
    let skipped = !results.skipped.is_empty()
        && options.report_all()
        && !options.execution.verbose;
    let data = deprecated_all(options, report.build(&report.skipped_minimal()));
    if !skipped {
        return Ok(Report { data, code: 0, details: None });
    }
    let details = deprecated_all(options, report.build(&report.skipped_detailed()));
    Ok(Report { data, code: 0, details: Some(details) })
}

fn deprecated_all(options: &Options, report: String) -> String {
    if options.all && matches!(options.to.as_str(), "head" | "latest") {
        format!(
            "  \"--all\" is deprecated for \"bit checkout {}\", please omit it.\n{report}",
            options.to,
        )
    } else {
        report
    }
}

/// `checkoutOutput(results, props)`.
struct Checkout<'r> {
    results: &'r Results,
    options: &'r Options,
    format: Formatter,
}

impl Checkout<'_> {
    fn chalk(&self) -> Chalk {
        self.format.chalk
    }

    /// `buildOutput(notCheckedOutSection)`.
    fn build(&self, skipped: &str) -> String {
        Formatter::join(&[
            skipped.to_string(),
            self.successful(),
            listed(&self.format, "removed components", &self.results.lists.removed),
            listed(&self.format, "added components", &self.results.lists.added),
            self.new_on_lane(),
            self.conflict_summary(),
            self.summary(),
        ])
    }

    /// `getNotCheckedOutOutputMinimal`.
    fn skipped_minimal(&self) -> String {
        let count = self.results.skipped.len();
        if count == 0 {
            return String::new();
        }
        if self.options.report_all() && !self.options.execution.verbose {
            return self.format.details_hint(&format!("full list of {count} skipped component(s)"));
        }
        self.skipped_detailed()
    }

    /// `getNotCheckedOutOutputDetailed`.
    fn skipped_detailed(&self) -> String {
        let items: Vec<String> = self.results.skipped
            .iter()
            .map(|(id, message)| self.format.item(&format!("{} - {message}", id.display())))
            .collect();
        self.format.section("checkout skipped", "", &items)
    }

    /// `getSuccessfulOutput`.
    fn successful(&self) -> String {
        match self.results.components.as_slice() {
            [] => String::new(),
            [component] => self.successful_one(component),
            components => self.successful_many(components),
        }
    }

    fn successful_one(&self, component: &Changed) -> String {
        let chalk = self.chalk();
        let id = &component.id;
        if self.to("reset") {
            let title = format!("successfully reset {}", chalk.bold(&id.display()));
            return self.format.success_summary(&title);
        }
        let version = if self.to("head") || self.to("latest") {
            id.version.clone()
        } else {
            self.results.version.clone()
        };
        let version = version.unwrap_or_else(|| "undefined".to_string());
        let title = format!(
            "successfully {} {} to version {}",
            if self.options.revert { "reverted" } else { "switched" },
            chalk.bold(&id.without_version()),
            chalk.bold(&version),
        );
        join_lines(&[
            self.format.success_summary(&title),
            self.results.apply_version_report(&self.format, false, false),
        ])
    }

    fn successful_many(&self, components: &[Changed]) -> String {
        if self.to("reset") {
            let items: Vec<String> = components
                .iter()
                .map(|component| self.format.item(&component.id.display()))
                .collect();
            return self.format.section("reset components", "", &items);
        }
        let target = if self.to("head") {
            "their head version".to_string()
        } else if self.to("latest") {
            "their latest version".to_string()
        } else if self.to("main") {
            "their main version".to_string()
        } else {
            let version = self.results.version.as_deref().unwrap_or("undefined");
            format!("version {}", self.chalk().bold(version))
        };
        let title = format!(
            "successfully {} {} components to {target}",
            if self.options.revert { "reverted" } else { "switched" },
            components.len(),
        );
        join_lines(&[
            self.format.success_summary(&title),
            self.results.apply_version_report(&self.format, true, self.to("head")),
        ])
    }

    fn to(&self, name: &str) -> bool {
        self.options.to == name
    }

    /// `getConflictSummary` with `conflictSummaryReport`.
    fn conflict_summary(&self) -> String {
        if self.results.components.is_empty() || !self.results.conflicts {
            return String::new();
        }
        let title = self.format.title(&format!(
            "{} files with conflicts summary",
            self.format.warn_symbol(),
        ));
        let hint = self.format.hint(
            "fix the conflicts above manually and then run \"bit install\".\nonce ready, snap/tag the components to persist the changes",
        );
        format!("{title}\n{}\n\n{hint}", self.results.conflict_lines(self.chalk()).join("\n"))
    }

    /// `getNewOnLaneOutput` of `checkoutOutput`.
    fn new_on_lane(&self) -> String {
        let items: Vec<String> = self.results.lists.lane.ids
            .iter()
            .map(|id| self.format.item(&id.display()))
            .collect();
        let title = if self.results.lists.lane.added {
            "new components from lane"
        } else {
            "new components on lane (not added)"
        };
        let description = if self.results.lists.lane.added {
            ""
        } else {
            "omit --workspace-only flag to add them"
        };
        self.format.section(title, description, &items)
    }

    /// `getSummary`.
    fn summary(&self) -> String {
        let chalk = self.chalk();
        let new_on_lane = if self.results.lists.lane.ids.is_empty() {
            String::new()
        } else {
            let state = if self.results.lists.lane.added { "added" } else { "not added" };
            format!(
                "\nNew on lane ({state}): {}",
                chalk.bold(&self.results.lists.lane.ids.len().to_string()),
            )
        };
        format!(
            "{}\nTotal Changed: {}\nTotal Unchanged: {}{new_on_lane}",
            self.format.title("Checkout Summary"),
            chalk.bold(&self.results.components.len().to_string()),
            chalk.bold(&self.results.skipped.len().to_string()),
        )
    }
}

#[cfg(test)]
mod report_tests;
