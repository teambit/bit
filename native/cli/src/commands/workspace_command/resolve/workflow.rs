//! JavaScript tooling options around Rust's snapshot transaction.

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
        let flag = if args[index] == "-b" { "--build" } else { args[index] };
        index += 1;
        if tooling_flag(flag, kind) {
            if !seen.insert(flag) {
                return None;
            }
            index += workflow.flag(flag, args.get(index).copied())?;
        } else {
            remaining.push(args[index - 1]);
        }
    }
    Some((workflow, remaining))
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
                    "--persist=skip-build" => self.build = false,
                    "--persist" => self.build = args.get(index + 1) != Some(&"skip-build"),
                    _ => {}
                }
            }
        }
        Ok(())
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
                    next.filter(|value| !value.starts_with('-'))?
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
        if let Some(tasks) = &self.pipeline.skip_tasks {
            params["skipTasks"] = json!(tasks);
        }
        if kind == Kind::Snap {
            params["isSnap"] = json!(true);
        }
        params
    }
}

#[cfg(test)]
mod tests;
