//! Predictable CI errors delegate before providers because the released handler prints V8 stacks.
use crate::commands::status::cache::cache_root;
use std::{env, path::Path};

pub(super) fn requires_node(root: &Path, history: &str) -> bool {
    if env::var_os("CI").is_none_or(|value| value.is_empty()) {
        return false;
    }
    let remotes = cache_root().join("config/global-remotes.json");
    bit_object_import::lane_history::ci_requires_published_diagnostic(root, &remotes, history)
        .unwrap_or(true)
}
