//! Capture one workspace target after bitmap, filesystem and policy checks.

use super::{Capture, Scan, bitmap, missing, policy, record, text};
use serde_json::Value;
use std::io;

impl Scan<'_> {
    /// One target: its policy, its files, its dependencies.
    pub(super) fn target(mut self, target: &Value, captured: &mut Capture) -> io::Result<()> {
        if self.behavior.missing_status_invalid
            && bitmap::capture_special(self.context, target, captured)?
        {
            return Ok(());
        }
        let policy = policy::status_policy(self.context, target)?;
        let directory = text(
            target
                .get("directory")
                .or_else(|| target.get("rootDir")),
        )?;
        if self.behavior.missing_status_invalid
            && missing::status_invalid(self.root, target, directory, captured)?
        {
            return Ok(());
        }
        if missing::capture(
            self.root,
            self.behavior.missing_checkout_reset,
            target,
            directory,
            captured,
        )? {
            return Ok(());
        }
        let files = self.files(directory)?;
        self.loaded_target(target, directory, &files, &policy, captured)
    }

    fn loaded_target(
        &mut self,
        target: &Value,
        directory: &str,
        files: &[String],
        policy: &policy::Policy,
        captured: &mut Capture,
    ) -> io::Result<()> {
        if self.behavior.missing_status_invalid
            && missing::status_invalid_files(self.root, target, directory, files, captured)?
        {
            return Ok(());
        }
        if missing::main_file(
            self.root,
            self.behavior.missing_checkout_reset,
            target,
            directory,
            files,
            captured,
        )? {
            return Ok(());
        }
        let Some(mut dependencies) = self.dependencies(target, directory, files, policy, captured)?
        else {
            return Ok(());
        };
        super::super::environments::diagnostics::issues(self.context, target, &mut dependencies)?;
        record(target, directory, files, policy, &dependencies, captured)?;
        bitmap::record_remote(
            self.behavior.missing_status_invalid,
            target,
            &policy.extensions,
            captured,
        )
    }
}
