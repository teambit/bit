//! Snapshot policy switches, separated from selection and version grammar.
//!
//! [`Policy`] and [`parse`] model `--build`, `--ignore-issues`, and related snap/tag flags serialized into [`Value`].

#[cfg(test)]
mod tests;

use serde_json::{Value, json};
use std::collections::HashSet;

/// Parsed snapshot policy flags (`--ignore-issues`, `--ignore-newest-version`, etc.).
#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub struct Policy {
    ignore_issues: Option<String>,
    ignore_newest_version: bool,
    rebuild_deps_graph: bool,
    no_lock_deps: bool,
    skip_published_versions: bool,
}

/// Consume policy flags while retaining all command grammar arguments in order.
#[must_use]
#[inline]
pub fn parse<'a>(args: &[&'a str], tag: bool) -> Option<(Policy, Vec<&'a str>)> {
    let mut policy = Policy::default();
    let mut remaining = Vec::with_capacity(args.len());
    let mut seen = HashSet::new();
    let mut index = 0;
    while index < args.len() {
        let raw = args[index];
        index += 1;
        if raw.trim() == "--" {
            remaining.push(raw);
            remaining.extend_from_slice(&args[index..]);
            break;
        }
        match policy.consume_arg(raw, args.get(index).copied(), tag, &mut seen)? {
            Some(consumed) => index += consumed,
            None => remaining.push(raw),
        }
    }
    Some((policy, remaining))
}

/// Expands short policy flag aliases (`-i`, `-I`) to their canonical long flag names.
#[inline]
fn policy_alias(raw: &str) -> &str {
    match raw {
        "-i" => "--ignore-issues",
        "-I" => "--ignore-newest-version",
        other => other,
    }
}

/// Returns `true` when `flag` is a recognized snapshot policy flag (including tag-only flags when `tag` is `true`).
#[inline]
fn is_policy_flag(flag: &str, tag: bool) -> bool {
    matches!(flag, "--ignore-issues" | "--rebuild-deps-graph" | "--no-lock-deps")
        || (tag && matches!(flag, "--ignore-newest-version" | "--skip-published-versions"))
}

impl Policy {
    /// Consumes a single policy argument `raw` (and optional `next` value), rejecting duplicate flags in `seen`.
    fn consume_arg<'a>(
        &mut self,
        raw: &'a str,
        next: Option<&'a str>,
        tag: bool,
        seen: &mut HashSet<&'a str>,
    ) -> Option<Option<usize>> {
        if let Some((raw_name, val)) = raw.split_once('=') {
            let name = policy_alias(raw_name.trim());
            if !is_policy_flag(name, tag) {
                return Some(None);
            }
            if !seen.insert(name) {
                return None;
            }
            self.inline_flag(name, val)?;
            return Some(Some(0));
        }
        let flag = policy_alias(raw.trim());
        if !is_policy_flag(flag, tag) {
            return Some(None);
        }
        if !seen.insert(flag) {
            return None;
        }
        self.flag(flag, next).map(Some)
    }

    #[inline]
    fn flag(&mut self, flag: &str, next: Option<&str>) -> Option<usize> {
        match flag {
            "--ignore-issues" => {
                self.ignore_issues = Some(valid_ignore_issues(next?)?);
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

    #[inline]
    fn inline_flag(&mut self, flag: &str, val: &str) -> Option<()> {
        if flag == "--ignore-issues" {
            self.ignore_issues = Some(valid_ignore_issues(val)?);
            return Some(());
        }
        let enabled = match val.trim() {
            "true" => true,
            "false" => false,
            _ => return None,
        };
        match flag {
            "--ignore-newest-version" => self.ignore_newest_version = enabled,
            "--rebuild-deps-graph" => self.rebuild_deps_graph = enabled,
            "--no-lock-deps" => self.no_lock_deps = enabled,
            "--skip-published-versions" => self.skip_published_versions = enabled,
            _ => return None,
        }
        Some(())
    }

    /// The engine's policy group. Omit default values for existing callers.
    #[inline]
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

#[inline]
fn valid_ignore_issues(val: &str) -> Option<String> {
    let val = val.trim();
    (!val.is_empty()
        && !val.starts_with('-')
        && val
            .split(',')
            .any(|part| !part.trim().is_empty()))
    .then(|| val.to_string())
}
