//! `format()` of `formatStatusOutput`: one component's line, with its
//! symbol, local versions and issues.

use super::{FAILURE, Status, TITLE_ONLY, WARNINGS, WithIssues};
use crate::commands::workspace_command::format::Formatter;
use serde_json::Value;

impl Status<'_> {
    /// `format(id, showIssues, undefined, localVersions, true, defaultSym)`:
    /// no status message and nothing soft-tagged. `warn` is the default symbol.
    pub(super) fn item(
        &self,
        id: (&str, Option<&str>),
        show_issues: bool,
        local: Option<&[String]>,
        warn: bool,
    ) -> String {
        let chalk = self.format.chalk;
        let with_issues = self.issues_of(id.0, id.1);
        let mut formatted =
            Formatter::item_with(&chalk.cyan(id.0), &self.symbol(with_issues, warn));
        if let Some(local) = local {
            formatted.push_str(&self.local_versions(local));
        }
        let Some(with_issues) = with_issues else {
            return formatted;
        };
        let label =
            if with_issues.tag_blocker() { chalk.red(FAILURE) } else { chalk.yellow(WARNINGS) };
        if !show_issues {
            return format!("{formatted} ... {label}");
        }
        self.troubleshooting.set(true);
        format!("{formatted} ... {label}{}", self.issues_text(with_issues.issues))
    }

    /// `getSymbol()`: the issues' symbol, or the default one.
    fn symbol(&self, with_issues: Option<&WithIssues<'_>>, warn: bool) -> String {
        match with_issues {
            Some(row) if row.tag_blocker() => self.format.error_symbol(),
            Some(_) => self.format.warn_symbol(),
            None if warn => self.format.warn_symbol(),
            None => self.format.chalk.dim("\u{203A}"),
        }
    }

    /// The staged versions: all with `--verbose`, otherwise the tags and
    /// the number of snaps.
    pub(super) fn local_versions(&self, versions: &[String]) -> String {
        if self.flags.verbose {
            return format!(" - versions: {}", versions.join(", "));
        }
        let (snaps, tags): (Vec<&String>, Vec<&String>) =
            versions.iter().partition(|version| is_hash(version));
        let mut parts = Vec::new();
        if !tags.is_empty() {
            let tags: Vec<&str> = tags
                .iter()
                .map(|tag| tag.as_str())
                .collect();
            parts.push(format!("versions: {}", tags.join(", ")));
        }
        if !snaps.is_empty() {
            parts.push(format!("{} snap(s)", snaps.len()));
        }
        let joined = parts.join(", ");
        format!(" - {joined}")
    }

    /// `formatIssues(issues)`: each issue's `outputForCLI`.
    pub(super) fn issues_text(&self, issues: &[Value]) -> String {
        let chalk = self.format.chalk;
        let output: String = issues
            .iter()
            .map(|issue| {
                let description = issue["description"].as_str().unwrap_or_default();
                let solution = issue["solution"]
                    .as_str()
                    .filter(|solution| !solution.is_empty())
                    .map_or_else(String::new, |solution| format!(" ({solution})"));
                let kind = issue["type"].as_str().unwrap_or_default();
                let title_only = TITLE_ONLY.contains(&kind);
                let colon = if title_only { "" } else { ":" };
                let title = chalk.yellow(&format!("\n       {description} {solution}{colon} \n"));
                if title_only {
                    return title;
                }
                let mut output = title;
                output.push_str(&chalk.white(issue["dataAsString"].as_str().unwrap_or_default()));
                output
            })
            .collect();
        format!("       {output}\n")
    }
}

/// `isHash`: 40 hexadecimal characters.
fn is_hash(version: &str) -> bool {
    version.len() == 40 && version.bytes().all(|byte| byte.is_ascii_hexdigit())
}
