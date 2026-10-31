//! The merge report: `mergeReport` of `@teambit/merging`. For `bit merge`
//! the report gets `MergeCmd`'s projection: components, skipped
//! components, the version, the snapshot results and `verbose`, so the
//! removed and conflict sections stay empty. `bit lane merge` gets the
//! whole result (`MergeLaneCmd`).

mod policy;

use crate::commands::{
    color::Chalk,
    workspace_command::{
        format::Formatter,
        results::{Report, Results, hydrate, listed},
    },
};
use serde_json::Value;
use std::io;

/// `compHasBeenRemovedMsg`.
const REMOVED: &str = "component has been removed";

/// Which result the report sees.
#[derive(Clone, Copy)]
pub struct Mode {
    pub verbose: bool,
    /// The whole result of a lane merge.
    pub lane: bool,
}

pub fn format(result: &Value, mode: Mode, chalk: Chalk) -> io::Result<Report> {
    let results = hydrate(result)?;
    let workspace = if mode.lane {
        policy::format(result.get("workspaceConfigUpdateResult"), chalk)?
    } else {
        String::new()
    };
    let config_conflicts = policy::conflicted(result, mode.lane)?;
    let report = Merge {
        results: &results,
        mode,
        format: Formatter::new(chalk),
        workspace,
        config_conflicts,
    };
    let others = report.other_skipped();
    let hidden = !others.is_empty() && !mode.verbose;
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
    mode: Mode,
    format: Formatter,
    workspace: String,
    config_conflicts: Vec<String>,
}

impl Merge<'_> {
    /// The sections around the skipped list.
    fn join(&self, skipped: &str) -> String {
        Formatter::join(&[
            self.success(),
            self.skipped_removed(),
            skipped.to_string(),
            self.removed(),
            self.snaps(),
            policy::conflict_section(&self.config_conflicts, &self.format),
            self.workspace.clone(),
            self.conflict_summary(),
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
            .map(str::trim)
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
            .filter(|(_, message)| message.trim() == REMOVED)
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
            .filter(|(_, message)| message.trim() != REMOVED)
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

    /// `getRemovedOutput(removedComponents)`.
    fn removed(&self) -> String {
        if !self.mode.lane {
            return String::new();
        }
        listed(&self.format, "removed components", &self.results.lists.removed)
    }

    /// Whether the merge left unresolved conflicts the report shows.
    fn with_conflicts(&self) -> bool {
        self.mode.lane && !self.results.components.is_empty() && self.results.conflicts
    }

    /// `getConflictSummary`.
    fn conflict_summary(&self) -> String {
        if !self.with_conflicts() {
            return String::new();
        }
        let title = self.format.title(&format!(
            "{} files with conflicts summary",
            self.format.warn_symbol(),
        ));
        let hint = self.format.hint(
            "merge process not completed due to the conflicts above. fix conflicts manually and then run \"bit install\".\nonce ready, snap/tag the components to complete the merge.",
        );
        format!("{title}\n{}\n\n{hint}", self.results.conflict_lines(self.chalk()).join("\n"))
    }

    /// `getSummary`.
    fn summary(&self) -> String {
        let bold = |text: &str| self.chalk().bold(text);
        let removed = if self.mode.lane { self.results.lists.removed.len() } else { 0 };
        let conflicted =
            if self.with_conflicts() { self.results.conflict_lines(self.chalk()).len() } else { 0 };
        let mut conflicts = Vec::new();
        if conflicted > 0 {
            conflicts.push(format!("{conflicted} components"));
        }
        if self.workspace.contains("workspace.jsonc has conflicts") {
            conflicts.push("workspace.jsonc file".into());
        }
        if !self.config_conflicts.is_empty() {
            conflicts.push("merge-conflict file".into());
        }
        let conflicts = if conflicts.is_empty() { "none".into() } else { conflicts.join(", ") };
        format!(
            "{}\nTotal Merged: {}\nTotal Unchanged: {}\nTotal Snapped: {}\nTotal Removed: {}\nConflicts: {}",
            self.format.title("Merge Summary"),
            bold(&self.results.components.len().to_string()),
            bold(&self.results.skipped.len().to_string()),
            bold(&self.results.snapped_count().to_string()),
            bold(&removed.to_string()),
            bold(&conflicts),
        )
    }
}
