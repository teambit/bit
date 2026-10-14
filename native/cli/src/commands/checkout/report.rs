//! The checkout report: `hydrateRustWorkspaceCommand` and `checkoutOutput`
//! of the Node.js glue, with the `merge-output` helpers of
//! `@teambit/component.modules.merge-helper` and the output formatter of
//! `@teambit/cli` they use.

mod format;

use super::options::Options;
use crate::commands::{
    color::Chalk,
    ids::Id,
    status::js::{array, decline, object, text},
};
use format::Formatter;
use serde_json::Value;
use std::io;

/// `FILE_CHANGES_CHECKOUT_MSG`.
const FILE_CHANGES: &str = "components with file changes";
const RESULT_KEYS: [&str; 8] = [
    "components",
    "failedComponents",
    "version",
    "removedComponents",
    "addedComponents",
    "leftUnresolvedConflicts",
    "mergeSnapResults",
    "mergeSnapError",
];

/// The command's `Report`: what is printed, the exit code, and the details
/// `bit details` shows.
pub struct Report {
    pub data: String,
    pub code: i32,
    pub details: Option<String>,
}

/// One switched component and the status of each of its files.
struct Changed {
    id: Id,
    files: Vec<(String, Status)>,
}

/// `FileStatus`: the key and its colored label.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Status {
    Merged,
    Manual,
    Updated,
    Added,
    Removed,
    Overridden,
    Unchanged,
    RemainDeleted,
    DeletedConflict,
}

impl Status {
    /// `binaryConflict` needs `is-binary-path`'s extension list: it declines.
    fn parse(name: &str) -> io::Result<Self> {
        Ok(match name {
            "merged" => Self::Merged,
            "manual" => Self::Manual,
            "updated" => Self::Updated,
            "added" => Self::Added,
            "removed" => Self::Removed,
            "overridden" => Self::Overridden,
            "unchanged" => Self::Unchanged,
            "remainDeleted" => Self::RemainDeleted,
            "deletedConflict" => Self::DeletedConflict,
            _ => return Err(decline(format!("native command report file status {name}"))),
        })
    }

    fn label(self, chalk: Chalk) -> String {
        match self {
            Self::Merged => chalk.green("auto-merged"),
            Self::Manual => chalk.red("CONFLICT"),
            Self::Updated => chalk.green("updated"),
            Self::Added => chalk.green("added"),
            Self::Removed => chalk.green("removed"),
            Self::Overridden => chalk.yellow("overridden"),
            Self::Unchanged => chalk.green("unchanged"),
            Self::RemainDeleted => chalk.green("remain-deleted"),
            Self::DeletedConflict => chalk.red("CONFLICT-deleted-and-modified"),
        }
    }
}

/// The hydrated `ApplyVersionResults` checkout reports on.
struct Results {
    components: Vec<Changed>,
    /// Components left as they were, with the reason.
    skipped: Vec<(Id, String)>,
    version: Option<String>,
    removed: Vec<Id>,
    added: Vec<Id>,
    conflicts: bool,
}

/// `formatRustWorkspaceCommand(result, options)` for checkout.
pub fn format(result: &Value, options: &Options, chalk: Chalk) -> io::Result<Report> {
    let results = hydrate(result)?;
    let report = Checkout { results: &results, options, format: Formatter::new(chalk) };
    let skipped = !results.skipped.is_empty() && options.all && !options.verbose;
    let data = report.build(&report.skipped_minimal());
    if !skipped {
        return Ok(Report { data, code: 0, details: None });
    }
    let details = report.build(&report.skipped_detailed());
    Ok(Report { data, code: 0, details: Some(details) })
}

/// `hydrateRustWorkspaceCommand`: the engine's result, validated.
fn hydrate(value: &Value) -> io::Result<Results> {
    let map = object(value)?;
    if map
        .keys()
        .any(|key| !RESULT_KEYS.contains(&key.as_str()))
    {
        return Err(decline("native command report shape"));
    }
    if map.contains_key("mergeSnapResults") || map.contains_key("mergeSnapError") {
        return Err(decline("native checkout report with merge snapshots"));
    }
    let version = match map.get("version") {
        None => None,
        Some(version) => Some(text(Some(version))?.to_string()),
    };
    let conflicts = match map.get("leftUnresolvedConflicts") {
        None => false,
        Some(Value::Bool(conflicts)) => *conflicts,
        Some(_) => return Err(decline("native command report conflicts")),
    };
    Ok(Results {
        components: rows(map.get("components"))?
            .iter()
            .map(changed)
            .collect::<io::Result<_>>()?,
        skipped: rows(map.get("failedComponents"))?
            .iter()
            .map(skipped)
            .collect::<io::Result<_>>()?,
        version,
        removed: ids(map.get("removedComponents"))?,
        added: ids(map.get("addedComponents"))?,
        conflicts,
    })
}

fn rows(value: Option<&Value>) -> io::Result<&[Value]> {
    let rows = array(value, "native command report rows")?;
    if rows.len() > 4096 {
        return Err(decline("native command report rows"));
    }
    Ok(rows)
}

fn ids(value: Option<&Value>) -> io::Result<Vec<Id>> {
    rows(value)?
        .iter()
        .map(|id| Id::parse(text(Some(id))?))
        .collect()
}

fn changed(row: &Value) -> io::Result<Changed> {
    let map = object(row)?;
    if map
        .keys()
        .any(|key| key != "id" && key != "filesStatus")
    {
        return Err(decline("native command report shape"));
    }
    let files =
        object(map.get("filesStatus").ok_or_else(|| decline("native command report files"))?)?
            .iter()
            .map(|(file, status)| Ok((file.clone(), Status::parse(text(Some(status))?)?)))
            .collect::<io::Result<_>>()?;
    Ok(Changed { id: Id::parse(text(map.get("id"))?)?, files })
}

/// Only components left unchanged for a legitimate reason reach the report.
fn skipped(row: &Value) -> io::Result<(Id, String)> {
    let map = object(row)?;
    let keys = ["id", "unchangedMessage", "unchangedLegitimately"];
    if map
        .keys()
        .any(|key| !keys.contains(&key.as_str()))
        || map.get("unchangedLegitimately") != Some(&Value::Bool(true))
    {
        return Err(decline("native command report failure"));
    }
    Ok((Id::parse(text(map.get("id"))?)?, text(map.get("unchangedMessage"))?.to_string()))
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
            self.listed("removed components", &self.results.removed),
            self.listed("added components", &self.results.added),
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
        if self.options.all && !self.options.verbose {
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
            "successfully switched {} to version {}",
            chalk.bold(&id.without_version()),
            chalk.bold(&version),
        );
        join_lines(&[self.format.success_summary(&title), self.apply_version_report(false, false)])
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
        let title = format!("successfully switched {} components to {target}", components.len());
        join_lines(&[
            self.format.success_summary(&title),
            self.apply_version_report(true, self.to("head")),
        ])
    }

    fn to(&self, name: &str) -> bool {
        self.options.to == name
    }

    /// `applyVersionReport(components, addName, showVersion)`.
    fn apply_version_report(&self, add_name: bool, show_version: bool) -> String {
        let chalk = self.chalk();
        let tab = if add_name { "\t" } else { "" };
        let changes: Vec<String> = self.results.components
            .iter()
            .filter_map(|component| {
                let files: Vec<String> = component.files
                    .iter()
                    .filter(|(_, status)| *status != Status::Unchanged)
                    .map(|(file, status)| {
                        format!(
                            "{tab}{} {} {}",
                            status.label(chalk),
                            chalk.bold(file),
                            self.note(*status),
                        )
                    })
                    .collect();
                if files.is_empty() {
                    return None;
                }
                let name = if !add_name {
                    String::new()
                } else if show_version {
                    component.id.display()
                } else {
                    component.id.without_version()
                };
                Some(format!("{name}\n{}", chalk.cyan(&files.join("\n"))))
            })
            .collect();
        if changes.is_empty() {
            return String::new();
        }
        format!("\n{}\n{}", self.format.title(FILE_CHANGES), changes.join("\n\n"))
    }

    /// `getFileStatusNote`.
    fn note(&self, status: Status) -> String {
        if status == Status::Manual {
            return self
                .chalk()
                .white(r#"automatic merge failed. please fix conflicts manually and then run "bit install""#);
        }
        String::new()
    }

    /// `getRemovedOutput` and `getAddedOutput`.
    fn listed(&self, label: &str, ids: &[Id]) -> String {
        if ids.is_empty() {
            return String::new();
        }
        let body: Vec<String> = ids.iter().map(Id::display).collect();
        format!("{}\n{}", self.format.title(&format!("{label} ({})", ids.len())), body.join("\n"))
    }

    /// `getConflictSummary` with `conflictSummaryReport`.
    fn conflict_summary(&self) -> String {
        if self.results.components.is_empty() || !self.results.conflicts {
            return String::new();
        }
        let chalk = self.chalk();
        let conflicts: Vec<String> = self.results.components
            .iter()
            .filter_map(|component| {
                let files: Vec<String> = component.files
                    .iter()
                    .filter(|(_, status)| *status == Status::Manual)
                    .map(|(file, status)| format!("\t{} {}", status.label(chalk), chalk.bold(file)))
                    .collect();
                (!files.is_empty()).then(|| {
                    format!("{}\n{}", component.id.without_version(), chalk.cyan(&files.join("\n")))
                })
            })
            .collect();
        let title = self.format.title(&format!(
            "{} files with conflicts summary",
            self.format.warn_symbol(),
        ));
        let hint = self.format.hint(
            "fix the conflicts above manually and then run \"bit install\".\nonce ready, snap/tag the components to persist the changes",
        );
        format!("{title}\n{}\n\n{hint}", conflicts.join("\n"))
    }

    /// `getSummary`.
    fn summary(&self) -> String {
        let chalk = self.chalk();
        format!(
            "{}\nTotal Changed: {}\nTotal Unchanged: {}",
            self.format.title("Checkout Summary"),
            chalk.bold(&self.results.components.len().to_string()),
            chalk.bold(&self.results.skipped.len().to_string()),
        )
    }
}

/// `[...].filter(Boolean).join('\n')`.
fn join_lines(parts: &[String]) -> String {
    parts
        .iter()
        .filter(|part| !part.is_empty())
        .cloned()
        .collect::<Vec<_>>()
        .join("\n")
}

#[cfg(test)]
mod report_tests;
