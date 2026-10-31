//! `SyncOrchestrator.syncInit`: onboard a repository without running reconciliation.
mod agents;
mod files;
mod git;
mod paths;
mod remote;
mod report;
mod report_github;

use super::workspace_command::{self, results::Report};
use crate::{commands::color::Chalk, native::Outcome};
use bit_workspace_config::jsonc::Document;
use std::{
    env,
    ffi::OsString,
    fs, io,
    path::{Path, PathBuf},
};

struct Plan {
    root: PathBuf,
    cwd: PathBuf,
    repository_root: Option<PathBuf>,
    scope: Option<String>,
}
pub(super) fn run(root: &Path, args: &[OsString]) -> io::Result<Outcome> {
    let plan = match prepare(root) {
        Ok(Some(plan)) => plan,
        Ok(None) => {
            return Ok(Outcome::Declined(
                "CI onboarding startup or configuration requires the published runtime".into(),
            ));
        }
        Err(error) => return Ok(Outcome::Declined(format!("CI onboarding preflight: {error}"))),
    };
    let chalk = Chalk::detect(args);
    workspace_command::execute_then(root, args, "sync", |output| {
        plan.execute(chalk, output)
            .map_err(|error| io::Error::new(error.kind(), chalk.red(&error.to_string())))
    })
}
fn prepare(root: &Path) -> io::Result<Option<Plan>> {
    let document = Document::parse(&fs::read_to_string(root.join("workspace.jsonc"))?)?;
    let value = document.value();
    if !files::supported(&document)
        || !crate::commands::remote_action::startup::supported(
            Some(root),
            &bit_workspace_config::scope_path(root),
            &value,
            true,
        )?
    {
        return Ok(None);
    }
    let scope = value
        .as_object()
        .and_then(|entries| {
            entries
                .iter()
                .find(|(name, _)| {
                    bit_install::config::aspect_id_without_version(trim(name))
                        == "teambit.workspace/workspace"
                })
        })
        .and_then(|(_, config)| config["defaultScope"].as_str())
        .map(trim)
        .filter(|scope| !scope.is_empty())
        .map(str::to_owned);
    Ok(Some(Plan {
        root: root.to_owned(),
        cwd: env::current_dir()?,
        repository_root: git::repository_root(root),
        scope,
    }))
}
impl Plan {
    fn execute(&self, chalk: Chalk, output: &bit_install::output::Output) -> io::Result<Report> {
        let target = self.target();
        let mut files = self.write_workflows(&target.branch, output)?;
        let config_added = files::config(&self.root)?;
        files.push(self.write_agents(&target)?);
        let changes = self.changes(files, config_added);
        let data = report::Report { target, changes };
        Ok(Report { data: report::render(&data, chalk), code: 0, details: None })
    }
    fn target(&self) -> report::Target {
        let origin = git::origin(&self.cwd);
        let (branch, guessed) = git::default_branch(&self.cwd);
        let relative = git::relative(&self.cwd, self.scaffold_root());
        let repo_root = if relative.as_os_str().is_empty() {
            ".".into()
        } else {
            relative.to_string_lossy().into_owned()
        };
        report::Target {
            scope: self.scope
                .as_deref()
                .map(str::trim)
                .filter(|scope| !scope.is_empty())
                .unwrap_or("<scope>")
                .to_owned(),
            repository: origin.as_deref().and_then(remote::repository),
            origin,
            branch,
            guessed,
            repo_root,
        }
    }
    fn scaffold_root(&self) -> &Path {
        self.repository_root.as_deref().unwrap_or(&self.root)
    }
    fn write_workflows(
        &self,
        branch: &str,
        output: &bit_install::output::Output,
    ) -> io::Result<Vec<report::File>> {
        let scaffold = self.scaffold_root();
        if self.repository_root.is_none() {
            output.warning(&format!(r#"could not resolve the git repository root ("git rev-parse --show-toplevel" failed — is this a git repository?). Writing the workflow files under the workspace instead: {}. If that is not the repository root, GitHub will not discover them — move .github/workflows there by hand."#, scaffold.display()));
        }
        let workspace_dir = git::relative(&paths::real(scaffold)?, &paths::real(&self.root)?)
            .to_string_lossy()
            .replace('\\', "/");
        let workspace_dir =
            if workspace_dir.starts_with("..") { "" } else { workspace_dir.trim_matches('/') };
        files::workflows(scaffold, &self.cwd, branch, workspace_dir)
    }
    fn write_agents(&self, target: &report::Target) -> io::Result<report::File> {
        let repo_name = target.repository
            .as_ref()
            .map_or_else(|| agents::UNKNOWN.into(), remote::Repository::display);
        let scope = self.scope
            .as_deref()
            .map(str::trim)
            .filter(|scope| !scope.is_empty())
            .unwrap_or("<owner>.<scope>");
        let section = agents::render(scope, &repo_name, &target.branch);
        let (status, note) = agents::write(&self.root, &section, &repo_name)?;
        Ok(report::File {
            relative: "AGENTS.md",
            display: git::display(&self.cwd, &self.root.join("AGENTS.md")),
            status,
            note,
        })
    }
    fn changes(&self, files: Vec<report::File>, config_added: bool) -> report::Changes {
        let commits = git::commits(&self.cwd);
        let handled = [
            self.scaffold_root().join(".github/workflows/bit-sync.yml"),
            self.scaffold_root().join(".github/workflows/bit-release.yml"),
            self.root.join("workspace.jsonc"),
            self.root.join("AGENTS.md"),
        ];
        let (stage, ignored) = if self.repository_root.is_some() {
            git::staging(&self.cwd, &self.cwd, &handled, commits)
        } else {
            (Vec::new(), Vec::new())
        };
        report::Changes {
            commits,
            git: self.repository_root.is_some(),
            files,
            config: git::display(&self.cwd, &self.root.join("workspace.jsonc")),
            config_added,
            stage,
            ignored,
        }
    }
}

fn shell_word(value: &str) -> String {
    if !value.is_empty()
        && value
            .bytes()
            .all(|ch| ch.is_ascii_alphanumeric() || b"_./@:+-".contains(&ch))
    {
        value.into()
    } else {
        format!("'{}'", value.replace('\'', r"'\''"))
    }
}

/// ECMAScript whitespace includes BOM and excludes NEXT LINE.
fn whitespace(character: char) -> bool {
    matches!(character, '\u{0009}'..='\u{000d}' | ' ' | '\u{00a0}' | '\u{1680}' |
        '\u{2000}'..='\u{200a}' | '\u{2028}' | '\u{2029}' | '\u{202f}' |
        '\u{205f}' | '\u{3000}' | '\u{feff}')
}
fn trim(value: &str) -> &str {
    value.trim_matches(whitespace)
}
