//! Read-only Git facts for the CI onboarding plan.
#[cfg(test)]
mod tests;

use std::path::{Path, PathBuf};

fn run(root: &Path, args: &[&str]) -> Option<String> {
    super::super::run_git(root, args)
        .ok()
        .map(|text| super::trim(&text).to_owned())
}
pub(super) fn origin(root: &Path) -> Option<String> {
    run(root, &["remote", "get-url", "origin"]).filter(|value| !value.is_empty())
}
pub(super) fn repository_root(root: &Path) -> Option<PathBuf> {
    run(root, &["rev-parse", "--show-toplevel"])
        .filter(|value| !value.is_empty())
        .map(PathBuf::from)
}
pub(super) fn commits(root: &Path) -> bool {
    run(root, &["rev-parse", "--verify", "--quiet", "HEAD"]).is_some_and(|value| !value.is_empty())
}
pub(super) fn default_branch(root: &Path) -> (String, bool) {
    if let Some(branch) = detected_branch(root) {
        return (branch, false);
    }
    let current = run(root, &["branch", "--show-current"]).unwrap_or_default();
    (if matches!(current.as_str(), "main" | "master") { current } else { "main".into() }, true)
}
fn detected_branch(root: &Path) -> Option<String> {
    let symbolic = run(root, &["symbolic-ref", "refs/remotes/origin/HEAD"]);
    if let Some(branch) = symbolic
        .as_deref()
        .and_then(|value| value.strip_prefix("refs/remotes/origin/"))
        .filter(|value| valid_branch(value))
    {
        return Some(branch.into());
    }
    if let Some(remote) = run(root, &["ls-remote", "--symref", "origin", "HEAD"]) {
        let branch = remote
            .lines()
            .find_map(|line| line.strip_prefix("ref: refs/heads/"))
            .map(|value| super::trim(value.split('\t').next().unwrap()));
        if let Some(branch) = branch.filter(|value| valid_branch(value)) {
            return Some(branch.into());
        }
    }
    let branches = run(root, &["branch", "-r"])?;
    ["main", "master"]
        .into_iter()
        .find(|name| {
            branches
                .lines()
                .any(|line| super::trim(line) == format!("origin/{name}"))
        })
        .map(str::to_owned)
}
fn valid_branch(value: &str) -> bool {
    !value.is_empty()
        && value != "@"
        && !value.starts_with(['-', '/'])
        && !value.starts_with("refs/")
        && !value.ends_with(['/', '.'])
        && !value.contains("..")
        && !value.contains("@{")
        && !value.contains("//")
        && !value
            .chars()
            .any(|ch| {
                super::whitespace(ch) || ch <= '\u{1f}' || ch == '\u{7f}' || r"~^:?*[\".contains(ch)
            })
        && value
            .split('/')
            .all(|part| !part.starts_with('.') && !part.ends_with(".lock"))
}
pub(super) fn staging(
    root: &Path,
    cwd: &Path,
    handled: &[PathBuf],
    commits: bool,
) -> (Vec<String>, Vec<String>) {
    let mut stage = Vec::new();
    let mut ignored = Vec::new();
    for path in handled {
        let arg = path.to_string_lossy();
        if run(root, &["check-ignore", "--", &arg]).is_some_and(|value| !value.is_empty()) {
            ignored.push(display(cwd, path));
        } else if commits
            && run(root, &["status", "--porcelain", "--untracked-files=all", "--", &arg])
                .is_none_or(|value| !value.is_empty())
        {
            stage.push(display(cwd, path));
        }
    }
    (stage, ignored)
}
pub(super) fn relative(from: &Path, to: &Path) -> PathBuf {
    let from: Vec<_> = from.components().collect();
    let target: Vec<_> = to.components().collect();
    let shared = from
        .iter()
        .zip(&target)
        .take_while(|(a, b)| a == b)
        .count();
    if shared == 0 {
        return to.to_path_buf();
    }
    let mut result = PathBuf::new();
    for _ in &from[shared..] {
        result.push("..");
    }
    for part in &target[shared..] {
        result.push(part.as_os_str());
    }
    result
}
pub(super) fn display(cwd: &Path, path: &Path) -> String {
    let result = relative(cwd, path);
    if result.as_os_str().is_empty() {
        path.to_string_lossy().into_owned()
    } else {
        result.to_string_lossy().into_owned()
    }
}
