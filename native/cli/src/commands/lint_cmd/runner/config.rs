//! `ESLintLinter.createTempTsConfigFile`: generated include/exclude paths and cache bytes.
//!
//! [`Config`] computes deterministic configuration digests via [`hash`] and writes temporary `TypeScript` configs.
mod hash;
#[cfg(test)]
mod tests;

use super::{Value, invalid, json};
use crate::commands::workspace_command::component_service::filesystem;
use std::{
    fs, io,
    path::{Path, PathBuf},
};

/// Staged temporary `tsconfig-{hash}.json` file path and serialized JSON bytes for `ESLint`.
pub(super) struct Config {
    pub path: PathBuf,
    bytes: Vec<u8>,
    existing: bool,
}

impl Config {
    /// Returns whether the hashed `tsconfig` file already exists in the workspace cache.
    #[must_use]
    #[inline]
    pub(super) const fn exists(&self) -> bool {
        self.existing
    }
    /// Builds the expanded `tsconfig` JSON for `directories` and verifies any existing cache file at `root`.
    pub(super) fn prepare(root: &Path, directories: &[&str]) -> io::Result<Self> {
        let mut config: Value = serde_json::from_str(include_str!(
            "../../../../../../scopes/react/react/typescript/tsconfig.json"
        ))?;
        let excludes =
            config["exclude"].as_array_mut().ok_or_else(|| invalid("linter excludes"))?;
        excludes.push(json!("./dist"));
        for key in ["include", "exclude"] {
            let patterns = config[key].as_array().ok_or_else(|| invalid("linter patterns"))?;
            config[key] = json!(expand_patterns(patterns, directories)?);
        }
        let name = format!("bit.tsconfig.eslint.{}.json", hash::hash(&config)?);
        let path = root.join("node_modules/.cache").join(name);
        let mut bytes = serde_json::to_vec_pretty(&config)?;
        bytes.push(b'\n');
        let existing = path.try_exists()?;
        if existing && fs::read(&path)? != bytes {
            return Err(invalid("linter noncanonical configuration cache"));
        }
        Ok(Self { path, bytes, existing })
    }

    #[inline]
    pub(super) fn publish(&self) -> io::Result<Option<Value>> {
        if !self.existing {
            let parent = self.path.parent().ok_or_else(|| invalid("linter cache parent"))?;
            if let Err(error) = fs::create_dir_all(parent) {
                return filesystem::error(error, parent, "mkdir").map(Some);
            }
            if let Err(error) = fs::write(&self.path, &self.bytes) {
                return filesystem::error(error, &self.path, "open").map(Some);
            }
        }
        Ok(None)
    }
}

#[inline]
fn expand_patterns(patterns: &[Value], directories: &[&str]) -> io::Result<Vec<Value>> {
    let mut expanded = Vec::with_capacity(patterns.len() * directories.len());
    for pattern in patterns {
        let value = pattern
            .as_str()
            .map(str::trim)
            .filter(|val| !val.is_empty())
            .ok_or_else(|| invalid("linter pattern"))?;
        for directory in directories {
            push_expanded_pattern(&mut expanded, directory, value);
        }
    }
    Ok(expanded)
}

#[inline]
fn push_expanded_pattern(expanded: &mut Vec<Value>, directory: &str, value: &str) {
    let trimmed = directory.trim();
    let normalized = if trimmed.contains('\\') {
        std::borrow::Cow::Owned(trimmed.replace('\\', "/"))
    } else {
        std::borrow::Cow::Borrowed(trimmed)
    };
    let directory = normalized.trim_matches('/');
    if !directory.is_empty() && directory != "." {
        expanded.push(json!(format!("../../{directory}/{value}")));
    }
}
