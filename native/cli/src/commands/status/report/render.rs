//! How `formatStatusOutput` and `renderSections` put the sections together.

use super::{AUTO_TAG, CLEAN, Status, ids};
use crate::commands::{status::js::decline, workspace_command::format::Formatter};
use std::io;

impl Status<'_> {
    /// `getWorkspaceIssuesOutput()`.
    pub(super) fn workspace_issues(&self) -> io::Result<String> {
        let issues = ids(self.result, "workspaceIssues")?;
        if issues.is_empty() {
            return Ok(String::new());
        }
        Ok(format!("\n\n{}\n{}", self.format.title("workspace issues"), issues.join("\n")))
    }

    /// The report without collapsed sections.
    pub(super) fn joined(
        &self,
        sections: &[String],
        warnings: &str,
        troubleshooting: &str,
        workspace_issues: &str,
    ) -> String {
        let mut message = Formatter::join(sections);
        if !warnings.is_empty() {
            message.push('\n');
            message.push_str(warnings);
        }
        if !troubleshooting.is_empty() {
            message.push('\n');
            message.push_str(troubleshooting);
        }
        if message.is_empty() {
            message = self.clean();
        }
        message.push_str(workspace_issues);
        message
    }

    /// `renderSections(sections, expand)`, the auto-tag section collapsed
    /// unless `--expand`.
    pub(super) fn rendered(
        &self,
        sections: &[String],
        summary: &str,
        suffixes: [&str; 2],
        workspace_issues: &str,
    ) -> String {
        let mut parts: Vec<String> = sections
            .iter()
            .enumerate()
            .map(|(index, section)| {
                // The auto-tag section is the eighth.
                if index == 7 && !section.is_empty() && !self.flags.expand {
                    summary.to_string()
                } else {
                    section.clone()
                }
            })
            .collect();
        let suffix: Vec<&str> = suffixes
            .iter()
            .map(|suffix| suffix.trim())
            .filter(|suffix| !suffix.is_empty())
            .collect();
        parts.push(suffix.join("\n"));
        parts.push(workspace_issues.trim().to_string());
        Formatter::join(&parts)
    }

    /// `buildCollapsibleSummary` of the auto-tag section.
    pub(super) fn collapsed(&self, ids: &[&str]) -> io::Result<String> {
        let chalk = self.format.chalk;
        let counts = scope_counts(ids)?;
        let mut shown: Vec<String> = counts
            .iter()
            .take(4)
            .map(|(scope, count)| format!("{scope} ({count})"))
            .collect();
        if counts.len() > 4 {
            shown.push(format!("+ {} more scopes", counts.len() - 4));
        }
        let title = self.format.title(&format!("components pending auto-tag ({})", ids.len()));
        let description = chalk.dim(&format!("  {AUTO_TAG}"));
        let hint = chalk.dim("\u{2014} use --expand to list");
        Ok(format!("{title}\n{description}\n   {}  {hint}", shown.join(" \u{b7} ")))
    }

    /// The clean workspace message.
    pub(super) fn clean(&self) -> String {
        let chalk = self.format.chalk;
        let symbol = chalk.green(if cfg!(windows) { "\u{2713}" } else { "\u{2714}" });
        format!("{symbol} {}", chalk.yellow(CLEAN))
    }
}

/// `countBy(ids, (id) => id.scope)`, the largest counts first. A scope of
/// digits only, which `Object.entries` would put first, declines.
fn scope_counts<'i>(ids: &[&'i str]) -> io::Result<Vec<(&'i str, usize)>> {
    let mut counts: Vec<(&str, usize)> = Vec::new();
    for identity in ids {
        let scope = identity.split_once('/').map_or(*identity, |(scope, _)| scope);
        if scope.bytes().all(|byte| byte.is_ascii_digit()) {
            return Err(decline("status report numeric scope"));
        }
        match counts
            .iter_mut()
            .find(|(seen, _)| *seen == scope)
        {
            Some((_, count)) => *count += 1,
            None => counts.push((scope, 1)),
        }
    }
    counts.sort_by_key(|(_, count)| std::cmp::Reverse(*count));
    Ok(counts)
}
