//! The engine's command result with the ids and versions it reports, and the `merge-output` helpers of
//! `@teambit/component.modules.merge-helper` that checkout and merge share.

mod snaps;

use super::format::Formatter;
use crate::commands::{
    color::Chalk,
    ids::Id,
    status::js::{array, decline, object, text},
};
use serde_json::Value;
use std::io;

/// `FILE_CHANGES_CHECKOUT_MSG`.
pub const FILE_CHANGES: &str = "components with file changes";
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
pub struct Changed {
    pub id: Id,
    pub files: Vec<(String, Status)>,
}

/// `FileStatus`: the key and its colored label.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Status {
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

    pub fn label(self, chalk: Chalk) -> String {
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
pub struct Results {
    pub components: Vec<Changed>,
    /// Components left as they were, with the reason.
    pub skipped: Vec<(Id, String)>,
    pub version: Option<String>,
    pub removed: Vec<Id>,
    pub added: Vec<Id>,
    pub conflicts: bool,
    /// `mergeSnapResults`.
    pub snaps: Option<snaps::Snaps>,
    /// `mergeSnapError`.
    pub snap_error: Option<snaps::SnapError>,
}

/// The engine's result, validated.
pub fn hydrate(value: &Value) -> io::Result<Results> {
    let map = object(value)?;
    if map
        .keys()
        .any(|key| !RESULT_KEYS.contains(&key.as_str()))
    {
        return Err(decline("native command report shape"));
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
        snaps: snaps::snaps(map.get("mergeSnapResults"))?,
        snap_error: snaps::snap_error(map.get("mergeSnapError"))?,
    })
}

pub(super) fn rows(value: Option<&Value>) -> io::Result<&[Value]> {
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

impl Results {
    /// `Total Snapped`: the snapped and auto-snapped components.
    pub fn snapped_count(&self) -> usize {
        self.snaps.as_ref().map_or(0, snaps::Snaps::count)
    }

    /// `applyVersionReport(components, addName, showVersion)`.
    pub fn apply_version_report(
        &self,
        format: &Formatter,
        add_name: bool,
        show_version: bool,
    ) -> String {
        let chalk = format.chalk;
        let tab = if add_name { "\t" } else { "" };
        let changes: Vec<String> = self.components
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
                            note(chalk, *status),
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
        format!("\n{}\n{}", format.title(FILE_CHANGES), changes.join("\n\n"))
    }

    /// `conflictSummaryReport(components).conflictStr`: each component with
    /// conflicting files and the files.
    pub fn conflict_lines(&self, chalk: Chalk) -> Vec<String> {
        self.components
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
            .collect()
    }
}

/// `getFileStatusNote`.
fn note(chalk: Chalk, status: Status) -> String {
    if status == Status::Manual {
        return chalk.white(
            r#"automatic merge failed. please fix conflicts manually and then run "bit install""#,
        );
    }
    String::new()
}

/// `getRemovedOutput` and `getAddedOutput`.
pub fn listed(format: &Formatter, label: &str, ids: &[Id]) -> String {
    if ids.is_empty() {
        return String::new();
    }
    let body: Vec<String> = ids.iter().map(Id::display).collect();
    format!("{}\n{}", format.title(&format!("{label} ({})", ids.len())), body.join("\n"))
}

/// `[...].filter(Boolean).join('\n')`.
pub fn join_lines(parts: &[String]) -> String {
    parts
        .iter()
        .filter(|part| !part.is_empty())
        .cloned()
        .collect::<Vec<_>>()
        .join("\n")
}
