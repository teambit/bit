//! `format()` of `formatStatusOutput`: one component's line, with its
//! symbol, local versions and issues.

use super::{FAILURE, Status, TITLE_ONLY, WARNINGS, WithIssues};
use crate::commands::{color::Chalk, workspace_command::format::Formatter};
use serde_json::Value;

impl Status<'_> {
    pub(super) fn during_merge_items(&self) -> std::io::Result<Vec<String>> {
        Ok(super::ids(self.result, "componentsDuringMergeState")?
            .iter()
            .map(|identity| self.item((identity, None), false, None, true))
            .collect())
    }
    pub(super) fn item_with_message(
        &self,
        id: &str,
        message: &str,
        warn: bool,
    ) -> std::io::Result<String> {
        let chalk = self.format.chalk;
        let symbol = self.symbol(self.issues_of(id, self.version(id)?), warn);
        let item = Formatter::item_with(&chalk.cyan(id), &symbol);
        Ok(format!("{item} ... {}", chalk.yellow(message)))
    }
    /// `format(id, showIssues, undefined, localVersions, true, defaultSym)`:
    /// no status message and nothing soft-tagged. `warn` is the default symbol.
    pub(super) fn item(
        &self,
        id: (&str, Option<&str>),
        show_issues: bool,
        local: Option<&[String]>,
        warn: bool,
    ) -> String {
        self.item_with_soft_tag(id, show_issues, local, warn, true)
    }

    pub(super) fn item_without_soft_tag(&self, id: (&str, Option<&str>)) -> String {
        self.item_with_soft_tag(id, false, None, false, false)
    }

    fn item_with_soft_tag(
        &self,
        id: (&str, Option<&str>),
        show_issues: bool,
        local: Option<&[String]>,
        warn: bool,
        show_soft_tag: bool,
    ) -> String {
        let chalk = self.format.chalk;
        let with_issues = self.issues_of(id.0, id.1);
        let mut formatted =
            Formatter::item_with(&chalk.cyan(id.0), &self.symbol(with_issues, warn));
        if let Some(local) = local {
            formatted.push_str(&self.local_versions(local));
        }
        let soft_tagged = show_soft_tag && self.soft_tagged.contains(&id.0);
        let Some(with_issues) = with_issues else {
            if soft_tagged {
                formatted.push_str(&chalk.green(" (soft-tagged)"));
            }
            return formatted;
        };
        let label = self.issue_label(with_issues, soft_tagged);
        if !show_issues {
            return format!("{formatted} ... {label}");
        }
        self.troubleshooting.set(true);
        format!("{formatted} ... {label}{}", self.issues_text(with_issues.issues))
    }

    fn issue_label(&self, with_issues: &WithIssues<'_>, soft_tagged: bool) -> String {
        let label = if with_issues.tag_blocker() { FAILURE } else { WARNINGS };
        let label = if soft_tagged { format!("{label} (soft-tagged)") } else { label.to_string() };
        if with_issues.tag_blocker() {
            self.format.chalk.red(&label)
        } else {
            self.format.chalk.yellow(&label)
        }
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
        format!("       {}\n", issue_output(issues, chalk))
    }
}

/// `isHash`: 40 hexadecimal characters.
fn is_hash(version: &str) -> bool {
    version.len() == 40 && version.bytes().all(|byte| byte.is_ascii_hexdigit())
}

/// `ExternalEnvWithoutVersion.formatSolution` overrides the static solution.
fn solution(issue: &Value) -> String {
    if issue["type"] == "ExternalEnvWithoutVersion" {
        return format!(
            r#"(run "bit env set {} {}")"#,
            issue["data"]["componentId"].as_str().unwrap_or_default(),
            issue["data"]["envId"].as_str().unwrap_or_default(),
        );
    }
    issue["solution"]
        .as_str()
        .filter(|solution| !solution.is_empty())
        .map_or_else(String::new, |solution| format!(" ({solution})"))
}

pub(super) fn issue_data(issue: &Value, chalk: Chalk) -> String {
    if issue["type"] != "UntrackedDependencies" {
        return issue["dataAsString"]
            .as_str()
            .unwrap_or_default()
            .to_owned();
    }
    let Some(data) = issue["data"].as_object() else {
        return String::new();
    };
    data.iter()
        .map(|(file, row)| {
            let space = if row["nested"] == true { "            " } else { "          " };
            let paths = row["untrackedFiles"]
                .as_array()
                .into_iter()
                .flatten()
                .map(|file| {
                    let path = file["relativePath"].as_str().unwrap_or_default();
                    if file["existing"] == true { chalk.yellow(path) } else { path.to_owned() }
                })
                .collect::<Vec<_>>()
                .join(", ");
            format!("{space}{file} -> {paths}")
        })
        .collect::<Vec<_>>()
        .join("\n")
}

/// Released `IssuesList.outputForCLI`, shared by status and snapshot blockers.
pub(in crate::commands) fn issue_output(issues: &[Value], chalk: Chalk) -> String {
    let output: String = issues
        .iter()
        .map(|issue| {
            if let Some(output) = issue["__callbackCLI"].as_str() {
                return output.to_owned();
            }
            let description = issue["description"].as_str().unwrap_or_default();
            let solution = solution(issue);
            let kind = issue["type"].as_str().unwrap_or_default();
            let title_only = TITLE_ONLY.contains(&kind);
            let colon = if title_only { "" } else { ":" };
            let title = chalk.yellow(&format!("\n       {description} {solution}{colon} \n"));
            if title_only {
                return title;
            }
            let mut output = title;
            output.push_str(&chalk.white(&issue_data(issue, chalk)));
            output
        })
        .collect();
    output
}
