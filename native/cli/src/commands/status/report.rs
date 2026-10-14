//! `bit status` without `--json`: `StatusCmd.report` and
//! `formatStatusOutput` of `status-formatter.ts`, over the result the native
//! status computes for `--json`.
//!
//! A result with sections the native status leaves to Node (invalid, removed,
//! soft-tagged or local-only components, import pending) declines, and so
//! does a forked lane or an issue whose data Node colors
//! (`UntrackedDependencies`) when stdout has colors.

mod item;
mod render;

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
/// Result sections the native status leaves empty; any row declines.
const UNSUPPORTED: [&str; 10] = [
    "invalidComponents",
    "importPendingComponents",
    "locallySoftRemoved",
    "remotelySoftRemoved",
    "softTaggedComponents",
    "localOnly",
    "pendingUpdatesFromMain",
    "updatesFromForked",
    "unavailableOnMain",
    "pendingUpdateDependents",
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

/// The `StatusFlags` the report takes.
#[derive(Debug, Default, PartialEq, Eq)]
pub(super) struct Flags {
    pub verbose: bool,
    pub warnings: bool,
    pub strict: bool,
    pub fail_on_error: bool,
    pub expand: bool,
}

/// `args` starts after the command name; `None` for other flags.
pub(super) fn parse(args: &[&str]) -> Option<Flags> {
    let mut flags = Flags::default();
    let mut seen: Vec<&str> = Vec::new();
    for arg in args {
        let flag = if *arg == "-w" { "--warnings" } else { arg };
        if seen.contains(&flag) {
            return None;
        }
        seen.push(flag);
        let field = match flag {
            "--verbose" => &mut flags.verbose,
            "--warnings" => &mut flags.warnings,
            "--strict" => &mut flags.strict,
            "--fail-on-error" => &mut flags.fail_on_error,
            "--expand" => &mut flags.expand,
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
    /// Each bitmap target's version, `None` for a new component.
    versions: HashMap<&'r str, Option<&'r str>>,
    /// Each model's head.
    heads: HashMap<String, &'r str>,
    /// `merge` distances of the histories.
    histories: &'r [Value],
    troubleshooting: std::cell::Cell<bool>,
}

/// `formatStatusOutput` and the collapsing of `StatusCmd.report`.
pub(super) fn report(
    result: &Value,
    context: &Value,
    flags: &Flags,
    chalk: Chalk,
) -> io::Result<Output> {
    supported(result, chalk)?;
    let status = Status::new(result, context, flags, chalk)?;
    let sections = status.sections()?;
    let auto_tag = ids(result, "autoTagPendingComponents")?;
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
    let mut data = if auto_tag.is_empty() {
        status.joined(&sections, &warnings, &troubleshooting, &workspace_issues)
    } else {
        let summary = status.collapsed(&auto_tag)?;
        status.rendered(&sections, &summary, [&warnings, &troubleshooting], &workspace_issues)
    };
    if let Some(lane) = status.lane()? {
        data.push_str("\n\ncurrent lane ");
        data.push_str(&status.format.chalk.bold(lane));
    }
    Ok(Output { data, code: status.code() })
}

/// The sections the native report renders.
fn supported(result: &Value, chalk: Chalk) -> io::Result<()> {
    for field in UNSUPPORTED {
        if !array(result.get(field), field)?.is_empty() {
            return Err(decline("status report section"));
        }
    }
    let lane = text(result.get("currentLaneId"))?;
    if lane.split_once('/').is_none() || !result["forkedLaneId"].is_null() {
        return Err(decline("status report lane"));
    }
    let colored_data = array(result.get("componentsWithIssues"), "issues")?
        .iter()
        .flat_map(|row| {
            row["issues"]
                .as_array()
                .into_iter()
                .flatten()
        })
        .any(|issue| issue["type"] == "UntrackedDependencies");
    let custom_solution = array(result.get("componentsWithIssues"), "issues")?
        .iter()
        .flat_map(|row| {
            row["issues"]
                .as_array()
                .into_iter()
                .flatten()
        })
        .any(|issue| issue["type"] == "ExternalEnvWithoutVersion");
    if custom_solution {
        return Err(decline("status report issue solution"));
    }
    if chalk.enabled() && colored_data {
        return Err(decline("status report colored issue data"));
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
            versions,
            heads,
            histories: array(context.get("histories"), "histories")?,
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
        self.versions
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

    /// The sections of `joinSections`, in order.
    fn sections(&self) -> io::Result<Vec<String>> {
        let format = &self.format;
        let new = self.new_components()?;
        let modified = self.listed("modifiedComponents", |identity| self.version(identity))?;
        let snapped =
            self.listed("snappedComponents", |identity| Ok(self.heads.get(identity).copied()))?;
        let auto_tag = self.listed("autoTagPendingComponents", |identity| self.version(identity))?;
        let during_merge: Vec<String> = ids(self.result, "componentsDuringMergeState")?
            .iter()
            .map(|identity| self.item((identity, None), false, None, true))
            .collect();
        Ok(vec![
            format.section("pending updates", OUTDATED, &self.outdated()?),
            format.section("pending merge", PENDING_MERGE, &self.pending_merge()?),
            format.section("components in merge state", DURING_MERGE, &during_merge),
            format.section("new components", NEW, &new),
            format.section("modified components", MODIFIED, &modified),
            format.section("snapped components (tag pending)", SNAPPED, &snapped),
            format.section("staged components", STAGED, &self.staged()?),
            format.section("components pending auto-tag", AUTO_TAG, &auto_tag),
            format.section("components with issues", WITH_ISSUES, &self.with_issues_items()),
        ])
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

    /// `pending merge`: the uncommon snaps on each side.
    fn pending_merge(&self) -> io::Result<Vec<String>> {
        ids(self.result, "mergePendingComponents")?
            .iter()
            .map(|identity| {
                let history = self
                    .histories
                    .iter()
                    .find(|row| row["identity"] == *identity)
                    .ok_or_else(|| decline("status report history"))?;
                let count = |side: &str| array(history["merge"].get(side), "merge distance").map(<[Value]>::len);
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
