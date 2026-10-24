//! `bit status` without `--json`: `StatusCmd.report` and
//! `formatStatusOutput` of `status-formatter.ts`, over the result the native
//! status computes for `--json`.
//!
//! Unsupported lane sections, a forked lane, or an issue whose data Node colors
//! (`UntrackedDependencies`) when stdout has colors.

pub(in crate::commands) use item::issue_output;

mod item;
mod lane_updates;
mod render;
mod sections;

use super::js::{array, decline, text};
use crate::commands::{color::Chalk, workspace_command::format::Formatter};
use serde_json::Value;
use std::{cmp::Ordering, collections::HashMap, io};

/// `statusFailureMsg`.
const FAILURE: &str = "issues found";
/// `statusWarningsMsg`.
const WARNINGS: &str = "warnings found";
/// `statusWorkspaceIsCleanMsg`.
const CLEAN: &str = r#"nothing to tag or export (use "bit create <template> <component>" to generate a new component)"#;
const IMPORT_PENDING: &str = r#"your workspace has outdated objects. please use "bit import" to pull the latest objects from the remote scope."#;
/// `TROUBLESHOOTING_MESSAGE`, before it is colored.
const TROUBLESHOOTING: &str =
    "learn more about Bit components: https://bit.dev/reference/components/component-anatomy";
/// Issues whose `outputForCLI` is the title alone.
const TITLE_ONLY: [&str; 5] = [
    "MissingDists",
    "MissingLinksFromNodeModulesToSrc",
    "CircularDependencies",
    "LegacyInsideHarmony",
    "MergeConfigHasConflict",
];
const OUTDATED: &str = "(use \"bit checkout head\" to merge changes)\n(use \"bit diff [component_id] [new_version]\" to compare changes)\n(use \"bit log [component_id]\" to list all available versions)";
const PENDING_MERGE: &str = "(use \"bit reset\" to discard local tags/snaps, and bit checkout head to re-merge with the remote.\nalternatively, to keep local tags/snaps history, use \"bit merge [component-id]\")";
const DURING_MERGE: &str = "(use \"bit snap/tag [--unmerged]\" to complete the merge process.\nto cancel the merge operation, use either \"bit lane merge-abort\" (for prior \"bit lane merge\" command)\nor use \"bit merge [component-id] --abort\" (for prior \"bit merge\" command)";
const NEW: &str = r#"(use "bit snap/tag" to lock a version with all your changes)"#;
const MODIFIED: &str = r#"(use "bit diff" to compare changes)"#;
const SNAPPED: &str = r#"(use "bit tag" or "bit tag --snapped" to lock a semver version)"#;
const STAGED: &str = r#"(use "bit export" to push these component versions to the remote scope)"#;
const WITH_ISSUES: &str = "(fix the issues according to the suggested solution)";
const AUTO_TAG: &str = "(these will be auto-tagged when their modified dependencies are tagged)";
const LOCAL_ONLY: &str = "(these components are excluded from tag/snap/export commands)";
const SOFT_TAGGED: &str = r#"(use "bit tag --persist" to complete the tag)"#;
const UNAVAILABLE_ON_MAIN: &str = r#"(use "bit checkout head" to make them available)"#;
const LOCALLY_REMOVED: &str = r#"(tag/snap and export the components to update the deletion to the remote. to undo deletion, run "bit recover")"#;
const REMOTELY_REMOVED: &str = r#"(use "bit remove" to remove them from the workspace. use "bit recover" to undo the deletion)"#;

/// The `StatusFlags` the report takes.
#[derive(Debug, Default, PartialEq, Eq)]
pub(super) struct Flags {
    pub lanes: bool,
    pub verbose: bool,
    pub warnings: bool,
    pub strict: bool,
    pub fail_on_error: bool,
    pub expand: bool,
    pub ignore_circular: bool,
}

/// `args` starts after the command name; `None` for other flags.
pub(super) fn parse(args: &[&str]) -> Option<Flags> {
    let mut flags = Flags::default();
    let mut seen: Vec<&str> = Vec::new();
    for arg in args {
        let flag = match *arg {
            "-w" => "--warnings",
            "-l" => "--lanes",
            "-c" => "--ignore-circular-dependencies",
            _ => arg,
        };
        if seen.contains(&flag) {
            return None;
        }
        seen.push(flag);
        let field = match flag {
            "--lanes" => &mut flags.lanes,
            "--verbose" => &mut flags.verbose,
            "--warnings" => &mut flags.warnings,
            "--strict" => &mut flags.strict,
            "--fail-on-error" => &mut flags.fail_on_error,
            "--expand" => &mut flags.expand,
            "--ignore-circular-dependencies" => &mut flags.ignore_circular,
            _ => return None,
        };
        *field = true;
    }
    Some(flags)
}

/// The report's text and exit code.
pub(super) struct Output {
    pub data: String,
    pub code: i32,
}

/// A component with issues: its id, version and issues.
struct WithIssues<'r> {
    identity: &'r str,
    version: Option<&'r str>,
    issues: &'r [Value],
}

impl WithIssues<'_> {
    fn tag_blocker(&self) -> bool {
        self.issues
            .iter()
            .any(|issue| issue["isTagBlocker"] == true)
    }
}

/// The status result with the context it needs: issues, versions, histories.
struct Status<'r> {
    result: &'r Value,
    format: Formatter,
    flags: &'r Flags,
    with_issues: Vec<WithIssues<'r>>,
    soft_tagged: Vec<&'r str>,
    models: ModelFacts<'r>,
    troubleshooting: std::cell::Cell<bool>,
}

struct ModelFacts<'r> {
    /// Each bitmap target's version, `None` for a new component.
    versions: HashMap<&'r str, Option<&'r str>>,
    /// Each model's head.
    heads: HashMap<String, &'r str>,
    /// `merge` distances of the histories.
    histories: &'r [Value],
}

/// `formatStatusOutput` and the collapsing of `StatusCmd.report`.
pub(super) fn report(
    result: &Value,
    context: &Value,
    flags: &Flags,
    chalk: Chalk,
) -> io::Result<Output> {
    lane_supported(result)?;
    let status = Status::new(result, context, flags, chalk)?;
    let sections = status.sections()?;
    let printed = status.printed_issues();
    let warnings_filtered = printed < status.with_issues.len();
    let warnings = if warnings_filtered {
        status.format.chalk.yellow("to view the warnings, use --warnings flag.")
    } else {
        String::new()
    };
    let troubleshooting = if status.troubleshooting.get() {
        status.format.chalk.yellow(TROUBLESHOOTING)
    } else {
        String::new()
    };
    let workspace_issues = status.workspace_issues()?;
    let mut data = render_data(&status, &sections, &warnings, &troubleshooting, &workspace_issues)?;
    if let Some(lane) = status.lane()? {
        data.push_str("\n\ncurrent lane ");
        data.push_str(&status.format.chalk.bold(lane));
    }
    if !ids(result, "importPendingComponents")?.is_empty() {
        data = format!("{IMPORT_PENDING}\n{data}");
    }
    Ok(Output { data, code: status.code() })
}

/// JSON includes the same `dataToString()` colors as the report process.
pub(super) fn color_issue_data(result: &mut Value, chalk: Chalk) {
    for component in result["componentsWithIssues"]
        .as_array_mut()
        .into_iter()
        .flatten()
    {
        for issue in component["issues"]
            .as_array_mut()
            .into_iter()
            .flatten()
        {
            if let Some(object) = issue.as_object_mut() {
                object.remove("__callbackCLI");
            }
            if issue["type"] == "UntrackedDependencies" {
                issue["dataAsString"] = Value::String(item::issue_data(issue, chalk));
            }
        }
    }
}

fn render_data(
    status: &Status<'_>,
    sections: &[String],
    warnings: &str,
    troubleshooting: &str,
    workspace_issues: &str,
) -> io::Result<String> {
    let auto_tag = ids(status.result, "autoTagPendingComponents")?;
    let update_dependents = ids(status.result, "pendingUpdateDependents")?;
    if auto_tag.is_empty() && update_dependents.is_empty() {
        Ok(status.joined(sections, warnings, troubleshooting, workspace_issues))
    } else {
        let auto_summary = status.collapsed(&auto_tag, "components pending auto-tag", AUTO_TAG)?;
        let dependent_summary = status.collapsed(
            &update_dependents,
            "pending update-dependents",
            "(impacted dependents that will be pushed on next export — from local cascade or 'Snap updates')",
        )?;
        Ok(status.rendered(
            sections,
            &auto_summary,
            &dependent_summary,
            [warnings, troubleshooting],
            workspace_issues,
        ))
    }
}

fn lane_supported(result: &Value) -> io::Result<()> {
    let lane = text(result.get("currentLaneId"))?;
    if lane.split_once('/').is_none()
        || result
            .get("forkedLaneId")
            .is_some_and(|id| {
                !id.is_null()
                    && id
                        .as_str()
                        .and_then(|id| id.split_once('/'))
                        .is_none()
            })
    {
        return Err(decline("status report lane"));
    }
    Ok(())
}

/// The string ids of a result section.
fn ids<'r>(result: &'r Value, field: &str) -> io::Result<Vec<&'r str>> {
    array(result.get(field), field)?
        .iter()
        .map(|id| text(Some(id)))
        .collect()
}

impl<'r> Status<'r> {
    /// The active non-main lane printed after the workspace issues.
    fn lane(&self) -> io::Result<Option<&'r str>> {
        let lane = text(self.result.get("currentLaneId"))?;
        Ok((!lane.ends_with("/main")).then_some(lane))
    }

    fn new(
        result: &'r Value,
        context: &'r Value,
        flags: &'r Flags,
        chalk: Chalk,
    ) -> io::Result<Self> {
        let mut versions = HashMap::new();
        for target in array(context.get("targets"), "targets")? {
            let version = text(target.get("version"))?;
            versions.insert(
                text(target.get("identity"))?,
                Some(version).filter(|version| !version.is_empty()),
            );
        }
        let mut heads = HashMap::new();
        for model in array(context.get("models"), "models")? {
            if let (Some(scope), Some(name), Some(head)) =
                (model["scope"].as_str(), model["name"].as_str(), model["head"].as_str())
            {
                heads.insert(format!("{scope}/{name}"), head);
            }
        }
        let mut status = Self {
            result,
            format: Formatter::new(chalk),
            flags,
            with_issues: Vec::new(),
            soft_tagged: ids(result, "softTaggedComponents")?,
            models: ModelFacts {
                versions,
                heads,
                histories: array(context.get("histories"), "histories")?,
            },
            troubleshooting: std::cell::Cell::new(false),
        };
        for row in array(result.get("componentsWithIssues"), "issues")? {
            let identity = text(row.get("id"))?;
            let version = status.version(identity)?;
            let issues = array(row.get("issues"), "issues")?;
            status.with_issues.push(WithIssues { identity, version, issues });
        }
        Ok(status)
    }

    /// The bitmap version of a workspace component.
    fn version(&self, identity: &str) -> io::Result<Option<&'r str>> {
        self.models.versions
            .get(identity)
            .copied()
            .ok_or_else(|| decline("status report target"))
    }

    /// `componentsWithIssues.find((c) => c.id.isEqual(id))`.
    fn issues_of(&self, identity: &str, version: Option<&str>) -> Option<&WithIssues<'r>> {
        self.with_issues
            .iter()
            .find(|row| row.identity == identity && row.version == version)
    }

    fn soft_tagged_items(&self) -> io::Result<Vec<String>> {
        self.soft_tagged
            .iter()
            .map(|identity| Ok(self.item_without_soft_tag((identity, self.version(identity)?))))
            .collect()
    }

    fn invalid_components(&self) -> io::Result<Vec<String>> {
        let mut items = array(self.result.get("invalidComponents"), "invalid")?
            .iter()
            .map(|row| {
                let identity = text(row.get("id"))?;
                let label = match row["error"]["name"].as_str() {
                    Some("ComponentNotFoundInPath") => r#"component files were deleted (use "bit remove [component_id]") or moved (use "bit move <old-dir> <new-dir>"). to restore use "bit checkout reset [component_id]""#,
                    Some("MainFileRemoved") => r#"main-file was removed (use "bit add" with "--main" and "--id" flags to add a main file)"#,
                    Some("ComponentsPendingImport") => r#"component objects are missing from the scope (use "bit import [component_id] --objects" to get them back)"#,
                    Some("IgnoredDirectory") => "component files or directory were ignored (probably by .gitignore)",
                    _ => return Err(decline("status report invalid component type")),
                };
                let text = format!("{} ... {}", self.format.chalk.cyan(identity), self.format.chalk.yellow(label));
                Ok(Formatter::item_with(&text, &self.format.warn_symbol()))
            })
            .collect::<io::Result<Vec<_>>>()?;
        items.sort_by(|left, right| utf16_order(left, right));
        Ok(items)
    }

    /// A section of ids, each formatted with the version its id has.
    fn listed(
        &self,
        field: &str,
        version: impl Fn(&str) -> io::Result<Option<&'r str>>,
    ) -> io::Result<Vec<String>> {
        ids(self.result, field)?
            .iter()
            .map(|identity| Ok(self.item((identity, version(identity)?), false, None, false)))
            .collect()
    }

    /// New components, those with blocking issues last.
    fn new_components(&self) -> io::Result<Vec<String>> {
        let formatted: Vec<String> = ids(self.result, "newComponents")?
            .iter()
            .map(|identity| self.item((identity, None), false, None, false))
            .collect();
        let (missing, other): (Vec<String>, Vec<String>) = formatted
            .into_iter()
            .partition(|item| item.contains(FAILURE));
        Ok(other
            .into_iter()
            .chain(missing)
            .collect())
    }

    /// `pending updates`: current, head and latest versions.
    fn outdated(&self) -> io::Result<Vec<String>> {
        let chalk = self.format.chalk;
        let mut rows = array(self.result.get("outdatedComponents"), "outdated")?
            .iter()
            .map(|row| {
                let identity = text(row.get("id"))?;
                let current = self.version(identity)?.unwrap_or_default();
                Ok((identity, current, row))
            })
            .collect::<io::Result<Vec<_>>>()?;
        // `sortObjectsWithId`: by the id with its version.
        rows.sort_by(|left, right| {
            super::collate::compare(
                &format!("{}@{}", left.0, left.1),
                &format!("{}@{}", right.0, right.1),
            )
        });
        rows.iter()
            .map(|(identity, current, row)| {
                let head = text(row.get("headVersion"))?;
                let latest = row["latestVersion"]
                    .as_str()
                    .filter(|latest| *latest != head)
                    .map_or_else(String::new, |latest| format!(" latest: {latest}"));
                let text =
                    format!("{} current: {current} head: {head}{latest}", chalk.cyan(identity));
                Ok(Formatter::item_with(&text, &self.format.warn_symbol()))
            })
            .collect()
    }

    /// `staged components` with their local versions.
    fn staged(&self) -> io::Result<Vec<String>> {
        array(self.result.get("stagedComponents"), "staged")?
            .iter()
            .map(|row| {
                let identity = text(row.get("id"))?;
                let versions = array(row.get("versions"), "staged versions")?
                    .iter()
                    .map(|version| text(Some(version)).map(str::to_string))
                    .collect::<io::Result<Vec<_>>>()?;
                Ok(self.item((identity, None), false, Some(&versions), false))
            })
            .collect()
    }

    /// The components whose issues are printed: blockers, or all with
    /// `--warnings`.
    fn printed_issues(&self) -> usize {
        self.with_issues
            .iter()
            .filter(|row| row.tag_blocker() || self.flags.warnings)
            .count()
    }

    /// `components with issues`, sorted as strings.
    fn with_issues_items(&self) -> Vec<String> {
        let mut items: Vec<String> = self.with_issues
            .iter()
            .filter(|row| row.tag_blocker() || self.flags.warnings)
            .map(|row| self.item((row.identity, row.version), true, None, false))
            .collect();
        items.sort_by(|left, right| utf16_order(left, right));
        items
    }

    /// `--strict` fails on any issue, `--fail-on-error` on blockers.
    fn code(&self) -> i32 {
        let blockers = self.with_issues.iter().any(WithIssues::tag_blocker);
        i32::from(
            (self.flags.strict && !self.with_issues.is_empty())
                || (!self.flags.strict && self.flags.fail_on_error && blockers),
        )
    }
}

/// `Array.prototype.sort`'s default order: UTF-16 code units.
fn utf16_order(left: &str, right: &str) -> Ordering {
    left.encode_utf16().cmp(right.encode_utf16())
}

#[cfg(test)]
mod report_tests;
