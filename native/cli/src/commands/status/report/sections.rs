//! Ordered sections of `formatStatusOutput`.

use super::{AUTO_TAG, FAILURE, Status, array, decline, ids, lane_updates, text};
use crate::commands::workspace_command::format::Formatter;
use std::{cmp::Ordering, io};

const OUTDATED: &str = "(use \"bit checkout head\" to merge changes)\n(use \"bit diff [component_id] [new_version]\" to compare changes)\n(use \"bit log [component_id]\" to list all available versions)";
const PENDING_MERGE: &str = "(use \"bit reset\" to discard local tags/snaps, and bit checkout head to re-merge with the remote.\nalternatively, to keep local tags/snaps history, use \"bit merge [component-id]\")";
const DURING_MERGE: &str = "(use \"bit snap/tag [--unmerged]\" to complete the merge process.\nto cancel the merge operation, use either \"bit lane merge-abort\" (for prior \"bit lane merge\" command)\nor use \"bit merge [component-id] --abort\" (for prior \"bit merge\" command)";
const NEW: &str = r#"(use "bit snap/tag" to lock a version with all your changes)"#;
const MODIFIED: &str = r#"(use "bit diff" to compare changes)"#;
const SNAPPED: &str = r#"(use "bit tag" or "bit tag --snapped" to lock a semver version)"#;
const STAGED: &str = r#"(use "bit export" to push these component versions to the remote scope)"#;
const WITH_ISSUES: &str = "(fix the issues according to the suggested solution)";
const LOCAL_ONLY: &str = "(these components are excluded from tag/snap/export commands)";
const SOFT_TAGGED: &str = r#"(use "bit tag --persist" to complete the tag)"#;
const UNAVAILABLE_ON_MAIN: &str = r#"(use "bit checkout head" to make them available)"#;
const LOCALLY_REMOVED: &str = r#"(tag/snap and export the components to update the deletion to the remote. to undo deletion, run "bit recover")"#;
const REMOTELY_REMOVED: &str = r#"(use "bit remove" to remove them from the workspace. use "bit recover" to undo the deletion)"#;

impl<'r> Status<'r> {
    /// The sections of `joinSections`, in order.
    pub(super) fn sections(&self) -> io::Result<Vec<String>> {
        let mut sections = self.version_sections()?;
        sections.extend(self.workspace_sections()?);
        Ok(sections)
    }

    fn version_sections(&self) -> io::Result<Vec<String>> {
        let format = &self.format;
        let new = self.new_components()?;
        let modified = self.listed("modifiedComponents", |identity| self.version(identity))?;
        let snapped = self.listed("snappedComponents", |identity| {
            Ok(self.models.heads.get(identity).copied())
        })?;
        let local_only = self.listed("localOnly", |identity| self.version(identity))?;
        Ok(vec![
            format.section("pending updates", OUTDATED, &self.outdated()?),
            format.section("pending merge", PENDING_MERGE, &self.pending_merge()?),
            format.section(
                "pending updates from main",
                lane_updates::UPDATES_FROM_MAIN,
                &self.updates_from_main()?,
            ),
            self.forked_section()?,
            format.section("components in merge state", DURING_MERGE, &self.during_merge_items()?),
            format.section("local-only components", LOCAL_ONLY, &local_only),
            format.section("new components", NEW, &new),
            format.section("modified components", MODIFIED, &modified),
            format.section("snapped components (tag pending)", SNAPPED, &snapped),
            format.section("staged components", STAGED, &self.staged()?),
            format.section(
                "pending update-dependents",
                "(impacted dependents that will be pushed on next export — from local cascade or 'Snap updates')",
                &self.pending_update_dependents()?,
            ),
        ])
    }

    fn pending_update_dependents(&self) -> io::Result<Vec<String>> {
        Ok(super::ids(self.result, "pendingUpdateDependents")?
            .iter()
            .map(|identity| self.item((identity, None), false, None, false))
            .collect())
    }

    fn forked_section(&self) -> io::Result<String> {
        let Some(id) = self.result.get("forkedLaneId").and_then(serde_json::Value::as_str) else {
            return Ok(String::new());
        };
        let id = id.trim();
        let (_, name) = id
            .split_once('/')
            .map(|(scope, name)| (scope.trim(), name.trim()))
            .filter(|(scope, name)| !scope.is_empty() && !name.is_empty())
            .ok_or_else(|| io::Error::other("forked lane id"))?;
        let description = format!(
            "(use \"bit lane merge {id}\" to merge the changes\nuse \"bit fetch {id} --lanes\" to update {name} locally)",
        );
        Ok(self.format.section(
            &format!("updates from {name}"),
            &description,
            &self.updates_from_forked()?,
        ))
    }

    fn workspace_sections(&self) -> io::Result<Vec<String>> {
        let format = &self.format;
        let auto_tag = self.listed("autoTagPendingComponents", |identity| self.version(identity))?;
        let locally_removed = self.listed("locallySoftRemoved", |identity| self.version(identity))?;
        let remotely_removed =
            self.listed("remotelySoftRemoved", |identity| self.version(identity))?;
        Ok(vec![
            format.section("soft-tagged components", SOFT_TAGGED, &self.soft_tagged_items()?),
            format.section(
                "components unavailable on main",
                UNAVAILABLE_ON_MAIN,
                &self.unavailable_on_main()?,
            ),
            format.section("components pending auto-tag", AUTO_TAG, &auto_tag),
            format.section("components with issues", WITH_ISSUES, &self.with_issues_items()),
            format.section(
                "invalid components",
                "these components failed to load",
                &self.invalid_components()?,
            ),
            format.section("soft-removed components locally", LOCALLY_REMOVED, &locally_removed),
            format.section("components deleted on the remote", REMOTELY_REMOVED, &remotely_removed),
        ])
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
                let identity = text(row.get("id").or_else(|| row.get("identity")))?.trim();
                let label = match row["error"]["name"].as_str().map(str::trim) {
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

    fn outdated(&self) -> io::Result<Vec<String>> {
        let chalk = self.format.chalk;
        let mut rows = array(self.result.get("outdatedComponents"), "outdated")?
            .iter()
            .map(|row| {
                let id = text(
                    row.get("id")
                        .or_else(|| row.get("identity")),
                )?;
                Ok((id, self.version(id)?.unwrap_or_default(), row))
            })
            .collect::<io::Result<Vec<_>>>()?;
        rows.sort_by(|left, right| {
            super::super::collate::compare(
                &format!("{}@{}", left.0, left.1),
                &format!("{}@{}", right.0, right.1),
            )
        });
        rows.iter()
            .map(|(identity, current, row)| {
                let head = text(row.get("headVersion"))?.trim();
                let latest = row["latestVersion"]
                    .as_str()
                    .map(str::trim)
                    .filter(|latest| !latest.is_empty() && *latest != head)
                    .map_or_else(String::new, |latest| format!(" latest: {latest}"));
                let text =
                    format!("{} current: {current} head: {head}{latest}", chalk.cyan(identity));
                Ok(Formatter::item_with(&text, &self.format.warn_symbol()))
            })
            .collect()
    }

    fn staged(&self) -> io::Result<Vec<String>> {
        array(self.result.get("stagedComponents"), "staged")?
            .iter()
            .map(|row| {
                let identity = text(
                    row.get("id")
                        .or_else(|| row.get("identity")),
                )?;
                let versions = array(row.get("versions"), "staged versions")?
                    .iter()
                    .map(|version| text(Some(version)).map(str::to_string))
                    .collect::<io::Result<Vec<_>>>()?;
                Ok(self.item((identity, None), false, Some(&versions), false))
            })
            .collect()
    }

    fn with_issues_items(&self) -> Vec<String> {
        let mut items: Vec<String> = self.with_issues
            .iter()
            .filter(|row| row.tag_blocker() || self.flags.warnings)
            .map(|row| self.item((row.identity, row.version), true, None, false))
            .collect();
        items.sort_by(|left, right| utf16_order(left, right));
        items
    }
}

fn utf16_order(left: &str, right: &str) -> Ordering {
    left.encode_utf16().cmp(right.encode_utf16())
}
