//! Dependency parser and detector dispatch in the retained environment session.
//!
//! Extends [`Environments`] with [`Environments::parser`] for custom aspect dependency detectors over [`Value`].
use super::{Environments, Value, decline, io, json, text};
use std::path::Path;

impl Environments {
    /// Parses custom-detector dependencies for `files` in `target` via built-in syntax or `host`.
    pub(in crate::commands::status) fn parser(
        &mut self,
        root: &Path,
        target: &Value,
        files: &[String],
        custom: &Value,
    ) -> io::Result<Value> {
        if self.builtin_services == super::builtin::Services::Compiler {
            return crate::commands::compile_cmd::syntax::parse(root, target, files, custom);
        }
        if self.builtin_services != super::builtin::Services::Disabled {
            return Err(decline("component service dependency parser"));
        }
        let directory = target_directory(root, target)?;
        let file_paths = target_file_paths(&directory, files);
        let mut parsed = self.host(root)?.call("parseDependencies",&json!({"files":file_paths,"exclude":custom.as_object().map(|custom|custom.keys().collect::<Vec<_>>()).unwrap_or_default()}))?;
        if let Some(custom) = custom.as_object() {
            parsed
                .as_object_mut()
                .ok_or_else(|| decline("parser receipt"))?
                .extend(custom.clone());
        }
        Ok(parsed)
    }

    /// Invokes `detectDependencies` on `self.host` when `target`'s environment requires custom detectors.
    pub(in crate::commands::status) fn detectors(
        &mut self,
        root: &Path,
        context: &Value,
        target: &Value,
        files: &[String],
    ) -> io::Result<Value> {
        let identity = text(target.get("identity"))?.trim();
        let facts = &context["environmentFacts"][identity];
        let env = facts["envId"]
            .as_str()
            .map(str::trim)
            .filter(|env| !env.is_empty())
            .unwrap_or("teambit.harmony/node");
        let bare_env = bit_install::policy::split_version(env).0;
        if self.builtin_services != super::builtin::Services::Disabled
            && bare_env == "teambit.react/react"
        {
            return Ok(Value::Null);
        }
        if (bare_env == "teambit.harmony/node" && facts.is_null()) || facts["nonLoaded"] == true {
            return Ok(Value::Null);
        }
        let directory = target_directory(root, target)?;
        let file_paths = target_file_paths(&directory, files);
        self.host(root)?.call("detectDependencies", &json!({"envId":env,"files":file_paths,"componentDir":directory,"aspectIds":facts["aspectIds"]}))
    }
}

#[inline]
fn target_directory(root: &Path, target: &Value) -> io::Result<std::path::PathBuf> {
    let dir = text(
        target
            .get("directory")
            .filter(|val| !val.is_null())
            .or_else(|| target.get("rootDir")),
    )?
    .trim();
    Ok(root.join(dir))
}

#[inline]
fn target_file_paths(directory: &Path, files: &[String]) -> Vec<std::path::PathBuf> {
    files
        .iter()
        .map(String::as_str)
        .map(|file| file.trim().trim_start_matches("./"))
        .filter(|file| !file.is_empty())
        .map(|file| directory.join(file))
        .collect()
}
