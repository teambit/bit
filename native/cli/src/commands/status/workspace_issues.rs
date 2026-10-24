//! Workspace-level merge and permitted Harmony load diagnostics.

use super::capture::{self, Capture};
use bit_install::config::MergeConfig;
use std::{io, path::Path};

pub(super) fn collect(root: &Path, capture: &Capture) -> io::Result<Vec<String>> {
    let mut issues = Vec::new();
    if MergeConfig::load(root)?.has_conflict("WORKSPACE") {
        issues.push(format!(
            "unable to parse the merge-conflict file {} as it has unresolved conflicts",
            root.join("merge-conflict").display(),
        ));
    }
    for message in capture::workspace_issues(capture)? {
        if !issues.contains(&message) {
            issues.push(message);
        }
    }
    Ok(issues)
}
