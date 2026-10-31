//! Predictable CI errors delegate before providers because the released handler prints V8 stacks.
use crate::commands::status::cache::cache_root;
use std::{env, path::Path};

pub(super) fn requires_node(root: &Path, history: &str) -> bool {
    if !is_ci_enabled() {
        return false;
    }
    let remotes = cache_root().join("config/global-remotes.json");
    bit_object_import::lane_history::ci_requires_published_diagnostic(root, &remotes, history)
        .unwrap_or(true)
}

fn is_ci_enabled() -> bool {
    env::var_os("CI")
        .is_some_and(|value| {
            let text = value.to_string_lossy();
            let trimmed = text.trim();
            !trimmed.is_empty() && trimmed != "0" && !trimmed.eq_ignore_ascii_case("false")
        })
}
