//! `getGitExecutablePath` ([`executable`], [`ScopeJson`]): the [`EffectiveConfig`] `git_path`, or `git`.

use crate::commands::status::cache::cache_root;
use bit_install::config::{
    EffectiveConfig, ScopeJson, WorkspaceConfig, load_global_config, scope_path,
};
use std::{io, path::Path};

pub(in crate::commands) fn executable(root: &Path) -> io::Result<String> {
    let global = load_global_config(&cache_root().join("config"))?;
    let workspace_root =
        (!root.as_os_str().is_empty()).then(|| crate::workspace::root(root)).flatten();
    let root = workspace_root.as_deref().unwrap_or(root);
    if root.as_os_str().is_empty() || !root.join("workspace.jsonc").is_file() {
        let from_global = global
            .get("git_path")
            .and_then(|val| val.as_str())
            .map(str::to_owned);
        return Ok(normalize_git_executable(from_global));
    }
    let scope = ScopeJson::load(&scope_path(root))?;
    let workspace = WorkspaceConfig::load(root)?;
    let configured =
        EffectiveConfig::new(&global, &scope.config, &workspace.config_store).get("git_path");
    Ok(normalize_git_executable(configured))
}

#[inline]
fn normalize_git_executable(configured: Option<String>) -> String {
    let sanitize = |raw: Option<String>| {
        raw.map(|path| path.trim().to_string())
            .filter(|path| !path.is_empty() && !path.starts_with('-'))
    };
    sanitize(configured)
        .or_else(|| sanitize(std::env::var("BIT_CONFIG_GIT_PATH").ok()))
        .unwrap_or_else(|| "git".to_string())
}
