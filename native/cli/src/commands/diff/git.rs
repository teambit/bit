//! `getGitExecutablePath`: the effective `git_path`, or `git`.

use crate::commands::status::cache::cache_root;
use bit_install::config::{
    EffectiveConfig, ScopeJson, WorkspaceConfig, load_global_config, scope_path,
};
use std::{io, path::Path};

pub(in crate::commands) fn executable(root: &Path) -> io::Result<String> {
    let workspace_root =
        (!root.as_os_str().is_empty()).then(|| crate::workspace::root(root)).flatten();
    let root = workspace_root.as_deref().unwrap_or(root);
    if root.as_os_str().is_empty() || !root.join("workspace.jsonc").is_file() {
        return Ok(normalize_git_executable(std::env::var("BIT_CONFIG_GIT_PATH").ok()));
    }
    let global = load_global_config(&cache_root().join("config"))?;
    let scope = ScopeJson::load(&scope_path(root))?;
    let workspace = WorkspaceConfig::load(root)?;
    let configured =
        EffectiveConfig::new(&global, &scope.config, &workspace.config_store).get("git_path");
    Ok(normalize_git_executable(configured))
}

fn normalize_git_executable(configured: Option<String>) -> String {
    configured
        .map(|path| path.trim().to_string())
        .filter(|path| !path.is_empty())
        .or_else(|| {
            std::env::var("BIT_CONFIG_GIT_PATH")
                .ok()
                .map(|path| path.trim().to_string())
                .filter(|path| !path.is_empty())
        })
        .unwrap_or_else(|| "git".to_string())
}
