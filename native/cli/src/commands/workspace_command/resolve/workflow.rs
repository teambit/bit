//! JavaScript tooling options around Rust's snapshot transaction.

#[cfg(test)]
mod tests;

use super::Kind;
use bit_install::config::{
    EffectiveConfig, ScopeJson, WorkspaceConfig, load_global_config, scope_path,
};
use serde_json::{Value, json};
use std::{collections::HashSet, io, path::Path};

#[derive(Debug, Default, PartialEq, Eq)]
pub struct Workflow {
    pub build: bool,
    pub editor: Option<String>,
    pipeline: Pipeline,
}

#[derive(Debug, Default, PartialEq, Eq)]
struct Pipeline {
    skip_tests: bool,
    skip_tasks: Option<String>,
    disable: bool,
    ignore_errors: bool,
    fail_fast: bool,
    loose: bool,
}

/// Remove tooling flags before the command's version/selection grammar is parsed.
pub fn parse<'a>(args: &[&'a str], kind: Kind) -> Option<(Workflow, Vec<&'a str>)> {
    let mut workflow = Workflow::default();
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
        match workflow.consume_arg(raw, args.get(index).copied(), kind, &mut seen)? {
            Some(consumed) => index += consumed,
            None => remaining.push(raw),
        }
    }
    Some((workflow, remaining))
}

fn workflow_alias(raw: &str) -> &str {
    if raw == "-b" { "--build" } else { raw }
}

fn tooling_flag(flag: &str, kind: Kind) -> bool {
    matches!(
        flag,
        "--build"
            | "--editor"
            | "--skip-tests"
            | "--skip-tasks"
            | "--ignore-build-errors"
            | "--loose",
    ) || (kind == Kind::Tag && matches!(flag, "--disable-tag-pipeline" | "--fail-fast"))
        || (kind == Kind::Snap && flag == "--disable-snap-pipeline")
}

impl Workflow {
    /// Config-store build policy, with `tag --persist[=skip-build]` taking precedence.
    pub fn configure(&mut self, root: &Path, args: &[&str], kind: Kind) -> io::Result<()> {
        let global =
            load_global_config(&crate::commands::status::cache::cache_root().join("config"))?;
        let scope = ScopeJson::load(&scope_path(root))?;
        let workspace = WorkspaceConfig::load(root)?;
        self.build |= EffectiveConfig::new(&global, &scope.config, &workspace.config_store)
            .get_bool("force_local_build")?
            .unwrap_or(false);
        if kind == Kind::Tag {
            for (index, argument) in args.iter().enumerate() {
                match *argument {
                    "--" => break,
                    "--persist=skip-build" => self.build = false,
                    "--persist" => self.build = args.get(index + 1) != Some(&"skip-build"),
                    _ => {}
                }
            }
        }
        Ok(())
    }

    fn consume_arg<'a>(
        &mut self,
        raw: &'a str,
        next: Option<&'a str>,
        kind: Kind,
        seen: &mut HashSet<&'a str>,
    ) -> Option<Option<usize>> {
        if let Some((raw_name, val)) = raw.split_once('=') {
            let name = workflow_alias(raw_name);
            if !tooling_flag(name, kind) {
                return Some(None);
            }
            if !seen.insert(name) {
                return None;
            }
            self.inline_flag(name, val)?;
            return Some(Some(0));
        }
        let flag = workflow_alias(raw);
        if !tooling_flag(flag, kind) {
            return Some(None);
        }
        if !seen.insert(flag) {
            return None;
        }
        self.flag(flag, next).map(Some)
    }

    fn flag(&mut self, flag: &str, next: Option<&str>) -> Option<usize> {
        match flag {
            "--build" => self.build = true,
            "--editor" => {
                let value = next.filter(|value| !value.starts_with('-'));
                let editor = value.unwrap_or("vim");
                self.editor = (!editor.is_empty()).then(|| editor.to_owned());
                return Some(usize::from(value.is_some()));
            }
            "--skip-tasks" => {
                self.pipeline.skip_tasks = Some(
                    next.map(str::trim)
                        .filter(|value| !value.is_empty() && !value.starts_with('-'))?
                        .to_string(),
                );
                return Some(1);
            }
            "--skip-tests" => self.pipeline.skip_tests = true,
            "--disable-tag-pipeline" | "--disable-snap-pipeline" => {
                self.pipeline.disable = true;
            }
            "--ignore-build-errors" => self.pipeline.ignore_errors = true,
            "--fail-fast" => self.pipeline.fail_fast = true,
            "--loose" => self.pipeline.loose = true,
            _ => return None,
        }
        Some(0)
    }

    fn inline_flag(&mut self, flag: &str, val: &str) -> Option<()> {
        match flag {
            "--editor" => {
                if val.starts_with('-') {
                    return None;
                }
                self.editor = (!val.is_empty()).then(|| val.to_owned());
                return Some(());
            }
            "--skip-tasks" => {
                if val.is_empty() || val.starts_with('-') {
                    return None;
                }
                self.pipeline.skip_tasks = Some(val.to_string());
                return Some(());
            }
            _ => {}
        }
        let enabled = match val {
            "true" => true,
            "false" => false,
            _ => return None,
        };
        match flag {
            "--build" => self.build = enabled,
            "--skip-tests" => self.pipeline.skip_tests = enabled,
            "--disable-tag-pipeline" | "--disable-snap-pipeline" => {
                self.pipeline.disable = enabled;
            }
            "--ignore-build-errors" => self.pipeline.ignore_errors = enabled,
            "--fail-fast" => self.pipeline.fail_fast = enabled,
            "--loose" => self.pipeline.loose = enabled,
            _ => return None,
        }
        Some(())
    }

    /// `VersionMaker.build` adapter parameters; all object/version state stays native.
    pub fn parameters(&self, kind: Kind) -> Value {
        let mut params = json!({
            "build": self.build,
            "editor": self.editor.as_deref().unwrap_or_default(),
            "skipTests": self.pipeline.skip_tests,
            "disableTagAndSnapPipelines": self.pipeline.disable,
            "ignoreBuildErrors": self.pipeline.ignore_errors,
            "exitOnFirstFailedTask": self.pipeline.fail_fast,
            "loose": self.pipeline.loose,
        });
        if kind == Kind::Resolve
            && let Some(object) = params.as_object_mut()
        {
            object.remove("editor");
        }
        if let Some(tasks) = &self.pipeline.skip_tasks {
            params["skipTasks"] = json!(tasks);
        }
        if matches!(kind, Kind::Snap | Kind::Resolve) {
            params["isSnap"] = json!(true);
        }
        params
    }
}
