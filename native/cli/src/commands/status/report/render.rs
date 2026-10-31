//! How `formatStatusOutput` and `renderSections` put the sections together.

use super::{CLEAN, Status, array, ids};
use crate::commands::{status::js::decline, workspace_command::format::Formatter};
use serde_json::Value;
use std::io;

impl Status<'_> {
    /// `pending merge`: the uncommon snaps on each side.
    pub(super) fn pending_merge(&self) -> io::Result<Vec<String>> {
        ids(self.result, "mergePendingComponents")?
            .iter()
            .map(|identity| {
                let history = self
                    .models
                    .histories
                    .iter()
                    .find(|row| history_identity(row) == Some(identity.trim()))
                    .ok_or_else(|| decline("status report history"))?;
                let count = |side: &str| {
                    array(history["merge"].get(side), "merge distance").map(<[Value]>::len)
                };
                let text = format!(
                    "{} local and remote have diverged and have {} (source) and {} (target) uncommon snaps respectively",
                    self.format.chalk.cyan(identity),
                    count("sourceOnly")?,
                    count("targetOnly")?,
                );
                Ok(Formatter::item_with(&text, &self.format.warn_symbol()))
            })
            .collect()
    }

    /// `getWorkspaceIssuesOutput()`.
    pub(super) fn workspace_issues(&self) -> io::Result<String> {
        let issues: Vec<&str> = ids(self.result, "workspaceIssues")?
            .into_iter()
            .filter(|issue| !issue.is_empty())
            .collect();
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
        auto_summary: &str,
        dependent_summary: &str,
        suffixes: [&str; 2],
        workspace_issues: &str,
    ) -> String {
        let mut parts: Vec<String> = sections
            .iter()
            .enumerate()
            .map(|(index, section)| {
                // The auto-tag section follows unavailable-on-main.
                if index == 10 && !section.is_empty() && !self.flags.expand {
                    dependent_summary.to_string()
                } else if index == 13 && !section.is_empty() && !self.flags.expand {
                    auto_summary.to_string()
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
    pub(super) fn collapsed(&self, ids: &[&str], title: &str, desc: &str) -> io::Result<String> {
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
        let title = self.format.title(&format!("{title} ({})", ids.len()));
        let description = chalk.dim(&format!("  {desc}"));
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
        let trimmed = identity.trim();
        let scope = trimmed.split_once('/').map_or(trimmed, |(scope, _)| scope.trim());
        if scope.is_empty() || scope.bytes().all(|byte| byte.is_ascii_digit()) {
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

fn history_identity(row: &Value) -> Option<&str> {
    row["identity"]
        .as_str()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .or_else(|| {
            row["id"]
                .as_str()
                .map(str::trim)
                .filter(|value| !value.is_empty())
        })
}
