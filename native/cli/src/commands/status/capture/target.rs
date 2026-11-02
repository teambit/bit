//! Capture one workspace target after bitmap, filesystem and policy checks.
//!
//! Implements [`Scan::target`], [`Scan::loaded_target`], and [`normalize_target_file`] using [`bitmap`], [`missing`], [`policy`], and [`record`] on [`Capture`] and [`Value`].

use super::{Capture, Scan, bitmap, missing, policy, record, text};
use serde_json::Value;
use std::io;

impl Scan<'_> {
    /// Captures one workspace `target` (policy, source files, and dependencies) into `captured` ([`Capture`]).
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
                .filter(|val| !val.is_null())
                .or_else(|| target.get("rootDir")),
        )?
        .trim();
        if directory.is_empty() {
            return Err(super::decline("target directory is empty"));
        }
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
        self.loaded_target(target, directory, files, &policy, captured)
    }

    /// Validates source file presence and records detected dependencies for `target` into `captured`.
    fn loaded_target(
        &mut self,
        target: &Value,
        directory: &str,
        files: Vec<String>,
        policy: &policy::Policy,
        captured: &mut Capture,
    ) -> io::Result<()> {
        let files = files
            .into_iter()
            .filter_map(normalize_target_file)
            .collect::<Vec<_>>();
        if self.behavior.missing_status_invalid
            && missing::status_invalid_files(self.root, target, directory, &files, captured)?
        {
            return Ok(());
        }
        if missing::main_file(
            self.root,
            self.behavior.missing_checkout_reset,
            target,
            directory,
            &files,
            captured,
        )? {
            return Ok(());
        }
        let Some(mut dependencies) =
            self.dependencies(target, directory, &files, policy, captured)?
        else {
            return Ok(());
        };
        super::super::environments::diagnostics::issues(self.context, target, &mut dependencies)?;
        record(target, directory, &files, policy, &dependencies, captured)?;
        bitmap::record_remote(
            self.behavior.missing_status_invalid,
            target,
            &policy.extensions,
            captured,
        )
    }
}

/// Trims whitespace and leading `./` from `file`, returning `None` when the resulting relative path is empty.
#[inline]
fn normalize_target_file(file: String) -> Option<String> {
    let trimmed = file.trim().trim_start_matches("./");
    if trimmed.is_empty() {
        None
    } else if trimmed.len() == file.len() {
        Some(file)
    } else {
        Some(trimmed.to_owned())
    }
}
