//! `renderInitReport` ([`Report`], [`File`]): the exact files and manual commands required for CI onboarding.
//!
//! Defines [`Target`] and [`Changes`] structures for formatting `bit ci init` output.
use super::{remote, shell_word};
use crate::commands::color::Chalk;

/// Onboarding file status entry for the `bit ci init` report.
pub(super) struct File {
    pub relative: &'static str,
    pub display: String,
    pub status: &'static str,
    pub note: Option<&'static str>,
}
/// Aggregated target repository metadata and file changes for `bit ci init` reporting.
pub(super) struct Report {
    pub target: Target,
    pub changes: Changes,
}
/// Target scope, repository, and default branch metadata for the `bit ci init` report.
pub(super) struct Target {
    pub scope: String,
    pub repository: Option<remote::Repository>,
    pub origin: Option<String>,
    pub branch: String,
    pub guessed: bool,
    pub repo_root: String,
}
/// Scaffolded file statuses, `workspace.jsonc` edits, and Git staging state for [`Report`].
pub(super) struct Changes {
    pub commits: bool,
    pub git: bool,
    pub files: Vec<File>,
    pub config: String,
    pub config_added: bool,
    pub stage: Vec<String>,
    pub ignored: Vec<String>,
}

/// Renders the complete `bit ci init` onboarding checklist and file summary for `report`.
pub(super) fn render(report: &Report, chalk: Chalk) -> String {
    let steps = if let Some(repository) = &report.target.repository {
        super::report_github::steps(report, repository, chalk)
    } else {
        unknown_steps(report, chalk)
    };
    let title = chalk.bold_white(&format!("Next: {} steps to go live", steps.len()));
    let guide = "Guide: https://github.com/teambit/acme-modular-store#set-it-up-for-your-own-scope";
    let footer = if report.target.repository.is_some() {
        format!(
            "After step 2 the sync runs on pushes to feature branches and every 30 minutes; step 3 adds instant Bit -> Git.\n{guide}",
        )
    } else {
        guide.into()
    };
    [
        header(report, chalk),
        files(report, chalk),
        format!("{title}\n\n{}", steps.join("\n\n")),
        chalk.dim(&footer),
    ]
    .join("\n\n")
}
fn header(report: &Report, chalk: Chalk) -> String {
    let redacted = report.target.origin
        .as_deref()
        .map(remote::redacted)
        .filter(|_| report.target.repository.is_none());
    let inert = redacted.as_deref().map(remote::inert);
    let target = if let Some(repo) = &report.target.repository {
        chalk.cyan(&repo.display())
    } else if let Some(origin) = &inert {
        format!("origin {origin}")
    } else {
        "no GitHub remote yet".into()
    };
    heading(report, chalk, &target, redacted.as_deref(), inert.as_deref())
}
fn heading(
    report: &Report,
    chalk: Chalk,
    target: &str,
    redacted: Option<&str>,
    inert: Option<&str>,
) -> String {
    let symbol = if cfg!(windows) { "✓" } else { "✔" };
    let mut lines = vec![format!(
        "{} {} for {}, mirrored to {target} {}",
        chalk.green(symbol),
        chalk.bold_white("Scaffolded bit ci sync"),
        chalk.cyan(report.target.scope.trim()),
        chalk.dim(&format!("(default branch: {})", report.target.branch.trim())),
    )];
    lines.extend(header_warnings(report, chalk, redacted, inert));
    lines.join("\n")
}
fn header_warnings(
    report: &Report,
    chalk: Chalk,
    redacted: Option<&str>,
    inert: Option<&str>,
) -> Vec<String> {
    let mut lines = Vec::new();
    if report.target.guessed {
        let why = if report.target.origin.is_some() {
            "the remote didn't name its default branch"
        } else {
            "no remote names the default branch"
        };
        lines.push(warning(&format!("{why}, so the workflows and AGENTS.md use \"{}\". If that's wrong,\n  edit the branch filters in both workflow files and the branch in the AGENTS.md sync section.", report.target.branch.trim()), chalk));
    }
    if let Some(origin) = redacted.filter(|origin| {
        Some(*origin) == inert && !remote::local(origin) && remote::host(origin).is_some()
    }) {
        lines.push(warning(
            "origin isn't a GitHub remote bit recognizes. For GitHub Enterprise Server, run:",
            chalk,
        ));
        lines.push(format!(
            "  {}",
            chalk.cyan(&format!(
                "GITHUB_SERVER_URL={} bit ci sync --init",
                shell_word(&remote::suggested(origin))
            )),
        ));
    }
    lines
}
#[inline]
fn warning(message: &str, chalk: Chalk) -> String {
    format!("{} {}", chalk.yellow("⚠"), chalk.yellow(message))
}
#[inline]
fn note(file: &File) -> &'static str {
    if let Some(note) = file.note {
        return note;
    }
    match (file.status, file.relative) {
        ("written", ".github/workflows/bit-sync.yml") => {
            "syncs lanes and branches: on export, on push, and every 30 minutes"
        }
        ("written", ".github/workflows/bit-release.yml") => {
            "releases the scope when a pull request merges"
        }
        ("written", "AGENTS.md") => "tells coding agents how the sync works in this repository",
        ("updated", _) => "added the sync rules at the top",
        (_, "AGENTS.md") => "already has the sync rules, left unchanged",
        _ => "already exists, left unchanged",
    }
}
fn files(report: &Report, chalk: Chalk) -> String {
    let width = report.changes.files
        .iter()
        .map(|file| file.display.encode_utf16().count())
        .chain([report.changes.config.encode_utf16().count()])
        .max()
        .unwrap_or(0)
        + 2;
    let item = |path: &str, note: &str| {
        format!(
            "   {} {path}{}{}",
            chalk.dim("›"),
            " ".repeat(width.saturating_sub(path.encode_utf16().count())),
            chalk.dim(note),
        )
    };
    let mut lines: Vec<_> = report.changes.files
        .iter()
        .map(|file| item(&file.display, note(file)))
        .collect();
    let config = if report.changes.config_added {
        r#"added "teambit.git/ci": { "sync": {} }"#
    } else {
        "already configures sync, left unchanged"
    };
    lines.push(item(&report.changes.config, config));
    lines.join("\n")
}
#[inline]
pub(super) fn step(
    number: usize,
    title: &str,
    who: &str,
    body: Vec<String>,
    chalk: Chalk,
) -> String {
    let mut lines = Vec::with_capacity(body.len() + 1);
    lines.push(format!(
        "{} {}",
        chalk.bold_white(&format!("{number}. {}", title.trim())),
        chalk.dim(&format!("({})", who.trim())),
    ));
    lines.extend(
        body.into_iter()
            .map(|line| format!("   {line}")),
    );
    lines.join("\n")
}
#[inline]
fn paths<'a>(values: impl IntoIterator<Item = &'a String>) -> String {
    values
        .into_iter()
        .map(|value| shell_word(value))
        .collect::<Vec<_>>()
        .join(" ")
}
#[inline]
fn is_dot_repo_root(repo_root: &str) -> bool {
    let trimmed = repo_root.trim();
    trimmed.is_empty() || trimmed == "."
}
fn staging(report: &Report, chalk: Chalk) -> Vec<String> {
    let mut lines = Vec::new();
    let repo_root = report.target.repo_root.trim();
    let is_dot = is_dot_repo_root(repo_root);
    if !report.changes.git {
        let root = if is_dot { String::new() } else { format!(" {}", shell_word(repo_root)) };
        lines.push(chalk.cyan(&format!(
            "git init -b {}{root}",
            shell_word(report.target.branch.trim()),
        )));
    }
    if !report.changes.commits {
        lines.push(chalk.cyan(if is_dot { "git add -A" } else { "git add -A :/" }));
    }
    if !report.changes.stage.is_empty() {
        lines.push(chalk.cyan(&format!("git add -- {}", paths(&report.changes.stage))));
    }
    if !report.changes.ignored.is_empty() {
        lines.push(chalk.cyan(&format!("git add -f -- {}", paths(&report.changes.ignored))));
        lines.push(chalk.dim(".gitignore matches these; -f adds them anyway"));
    }
    lines
}
pub(super) fn commit(report: &Report, chalk: Chalk) -> Vec<String> {
    let mut lines = staging(report, chalk);
    let has_targets =
        !report.changes.stage.is_empty() || !report.changes.ignored.is_empty();
    if report.changes.commits && !has_targets {
        lines.push(chalk.dim("nothing to commit: these files are already committed"));
    } else {
        let message = format!(
            "git commit -m {}",
            shell_word(&format!("Mirror {}", report.target.scope.trim())),
        );
        if report.changes.commits {
            let joined = paths(report.changes.stage.iter().chain(&report.changes.ignored));
            lines.push(chalk.cyan(&format!(r"{message} -- \")));
            lines.push(chalk.cyan(&format!("  {joined}")));
        } else {
            lines.push(chalk.cyan(&message));
        }
    }
    lines
}
fn unknown_steps(report: &Report, chalk: Chalk) -> Vec<String> {
    let mut commands = commit(report, chalk);
    let title = if report.target.origin.is_some() {
        commands.push(chalk.cyan("git push -u origin HEAD"));
        "Push it"
    } else {
        let repo_root = report.target.repo_root.trim();
        let source = if repo_root.is_empty() { "." } else { repo_root };
        commands.push(chalk.cyan(&format!(
            "gh repo create --private --source {} --remote origin --push",
            shell_word(source),
        )));
        commands.push(chalk.dim(
            r#"names the repository after its root folder; add OWNER/NAME after "create" to choose"#,
        ));
        "Create the repository and push it"
    };
    vec![step(1, title, "you", commands, chalk), step(2, "Run bit ci sync --init again", "you", vec![
        "Once origin is a GitHub remote bit recognizes, it prints the secret, permission and webhook".into(),
        "steps for your repository as commands.".into(),
    ], chalk)]
}
