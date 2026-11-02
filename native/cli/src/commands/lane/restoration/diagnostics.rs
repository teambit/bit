//! Predictable CI errors delegate before providers because the released handler prints V8 stacks.
//!
//! [`requires_node`] checks whether CI mode ([`is_ci_enabled`]) should delegate missing history targets to Node.js using [`cache_root`].
use crate::commands::status::cache::cache_root;
use std::{env, path::Path};

/// Returns whether CI is active ([`is_ci_enabled`]) and `history` triggers a diagnostic that requires the Node.js runtime.
#[inline]
pub(super) fn requires_node(root: &Path, history: &str) -> bool {
    if !is_ci_enabled() {
        return false;
    }
    let history = history.trim();
    if history.is_empty() || history.starts_with('-') {
        return true;
    }
    let remotes = cache_root().join("config/global-remotes.json");
    bit_object_import::lane_history::ci_requires_published_diagnostic(root, &remotes, history)
        .unwrap_or(true)
}

/// Returns whether the `CI` environment variable is set to a truthy non-empty value.
#[inline]
fn is_ci_enabled() -> bool {
    env::var_os("CI")
        .is_some_and(|value| {
            let text = value.to_string_lossy();
            let trimmed = text
                .trim()
                .trim_matches(['"', '\''])
                .trim();
            !trimmed.is_empty()
                && !["0", "false", "no", "off"]
                    .iter()
                    .any(|falsy| trimmed.eq_ignore_ascii_case(falsy))
        })
}
