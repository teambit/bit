//! Ordered sections of `formatStatusOutput`.

use super::{
    AUTO_TAG, DURING_MERGE, LOCAL_ONLY, LOCALLY_REMOVED, MODIFIED, NEW, OUTDATED, PENDING_MERGE,
    REMOTELY_REMOVED, SNAPPED, SOFT_TAGGED, STAGED, Status, UNAVAILABLE_ON_MAIN, WITH_ISSUES,
    lane_updates,
};
use std::io;

impl Status<'_> {
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
            format.section("components in merge state", DURING_MERGE, &self.during_merge_items()?),
            format.section("local-only components", LOCAL_ONLY, &local_only),
            format.section("new components", NEW, &new),
            format.section("modified components", MODIFIED, &modified),
            format.section("snapped components (tag pending)", SNAPPED, &snapped),
            format.section("staged components", STAGED, &self.staged()?),
        ])
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
}
