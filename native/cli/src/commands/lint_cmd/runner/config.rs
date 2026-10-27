//! `ESLintLinter.createTempTsConfigFile`: generated include/exclude paths and cache bytes.
mod hash;
#[cfg(test)]
mod tests;

use super::{Value, invalid, json};
use crate::commands::workspace_command::component_service::filesystem;
use std::{
    fs, io,
    path::{Path, PathBuf},
};

pub(super) struct Config {
    pub path: PathBuf,
    bytes: Vec<u8>,
    existing: bool,
}

impl Config {
    pub(super) fn prepare(root: &Path, directory: &str) -> io::Result<Self> {
        let mut config: Value = serde_json::from_str(include_str!(
            "../../../../../../scopes/react/react/typescript/tsconfig.json"
        ))?;
        let excludes =
            config["exclude"].as_array_mut().ok_or_else(|| invalid("linter excludes"))?;
        excludes.push(json!("./dist"));
        for key in ["include", "exclude"] {
            for pattern in config[key].as_array_mut().ok_or_else(|| invalid("linter patterns"))? {
                let value = pattern.as_str().ok_or_else(|| invalid("linter pattern"))?;
                *pattern = json!(format!("../../{directory}/{value}"));
            }
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
