//! Snapshot policy switches, separated from selection and version grammar.

use serde_json::{Value, json};
use std::collections::HashSet;

#[derive(Debug, Default, PartialEq, Eq)]
pub struct Policy {
    ignore_issues: Option<String>,
    ignore_newest_version: bool,
    rebuild_deps_graph: bool,
    no_lock_deps: bool,
    skip_published_versions: bool,
}

/// Consume policy flags while retaining all command grammar arguments in order.
pub fn parse<'a>(args: &[&'a str], tag: bool) -> Option<(Policy, Vec<&'a str>)> {
    let mut policy = Policy::default();
    let mut remaining = Vec::new();
    let mut seen = HashSet::new();
    let mut index = 0;
    while index < args.len() {
        let flag = match args[index] {
            "-i" => "--ignore-issues",
            "-I" => "--ignore-newest-version",
            other => other,
        };
        index += 1;
        if !(matches!(flag, "--ignore-issues" | "--rebuild-deps-graph" | "--no-lock-deps")
            || (tag && matches!(flag, "--ignore-newest-version" | "--skip-published-versions")))
        {
            remaining.push(args[index - 1]);
            continue;
        }
        if !seen.insert(flag) {
            return None;
        }
        index += policy.flag(flag, args.get(index).copied())?;
    }
    Some((policy, remaining))
}

impl Policy {
    fn flag(&mut self, flag: &str, next: Option<&str>) -> Option<usize> {
        match flag {
            "--ignore-issues" => {
                self.ignore_issues = Some(
                    next.filter(|value| !value.starts_with('-'))?
                        .to_string(),
                );
                return Some(1);
            }
            "--ignore-newest-version" => self.ignore_newest_version = true,
            "--rebuild-deps-graph" => self.rebuild_deps_graph = true,
            "--no-lock-deps" => self.no_lock_deps = true,
            "--skip-published-versions" => self.skip_published_versions = true,
            _ => return None,
        }
        Some(0)
    }

    /// The engine's policy group. Omit default values for existing callers.
    pub fn apply(&self, options: &mut Value) {
        if self != &Self::default() {
            options["policy"] = json!({
                "ignoreIssues":self.ignore_issues,
                "ignoreNewestVersion":self.ignore_newest_version,
                "rebuildDepsGraph":self.rebuild_deps_graph,
                "noLockDeps":self.no_lock_deps,
                "skipPublishedVersions":self.skip_published_versions,
            });
        }
    }
}

#[cfg(test)]
mod tests;
