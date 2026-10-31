//! Snapshot policy switches, separated from selection and version grammar.

#[cfg(test)]
mod tests;

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
        let raw = args[index];
        index += 1;
        if raw == "--" {
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

fn policy_alias(raw: &str) -> &str {
    match raw {
        "-i" => "--ignore-issues",
        "-I" => "--ignore-newest-version",
        other => other,
    }
}

fn is_policy_flag(flag: &str, tag: bool) -> bool {
    matches!(flag, "--ignore-issues" | "--rebuild-deps-graph" | "--no-lock-deps")
        || (tag && matches!(flag, "--ignore-newest-version" | "--skip-published-versions"))
}

impl Policy {
    fn consume_arg<'a>(
        &mut self,
        raw: &'a str,
        next: Option<&'a str>,
        tag: bool,
        seen: &mut HashSet<&'a str>,
    ) -> Option<Option<usize>> {
        if let Some((raw_name, val)) = raw.split_once('=') {
            let name = policy_alias(raw_name);
            if !is_policy_flag(name, tag) {
                return Some(None);
            }
            if !seen.insert(name) {
                return None;
            }
            self.inline_flag(name, val)?;
            return Some(Some(0));
        }
        let flag = policy_alias(raw);
        if !is_policy_flag(flag, tag) {
            return Some(None);
        }
        if !seen.insert(flag) {
            return None;
        }
        self.flag(flag, next).map(Some)
    }
    fn flag(&mut self, flag: &str, next: Option<&str>) -> Option<usize> {
        match flag {
            "--ignore-issues" => {
                self.ignore_issues = Some(
                    next.filter(|value| !value.is_empty() && !value.starts_with('-'))?
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

    fn inline_flag(&mut self, flag: &str, val: &str) -> Option<()> {
        if flag == "--ignore-issues" {
            if val.is_empty() || val.starts_with('-') {
                return None;
            }
            self.ignore_issues = Some(val.to_string());
            return Some(());
        }
        let enabled = match val {
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
