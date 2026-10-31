#[cfg(test)]
mod tests;

use super::{error, observe::Observed, unsupported};
use std::{
    collections::HashSet,
    fs, io,
    path::{Component, Path, PathBuf},
};

pub(super) fn select(
    root: &Path,
    cwd: &Path,
    patterns: &[String],
    observed: &mut Observed,
) -> io::Result<Vec<String>> {
    let mut selected = Vec::new();
    let mut seen = HashSet::new();
    for pattern in patterns {
        for path in candidates(root, cwd, pattern, observed)? {
            let relative = tracked_directory(root, cwd, &path)?;
            if seen.insert(relative.clone()) {
                selected.push(relative);
            }
        }
    }
    if selected.is_empty() {
        return Err(error(format!(
            r#"error: file or directory "{}" was not found."#,
            patterns.join(", "),
        )));
    }
    Ok(selected)
}
fn candidates(
    root: &Path,
    cwd: &Path,
    pattern: &str,
    observed: &mut Observed,
) -> io::Result<Vec<PathBuf>> {
    let absolute = normalize(&cwd.join(pattern));
    if magic(pattern) {
        expand(root, &absolute, observed)
    } else if absolute.exists() {
        Ok(vec![absolute])
    } else {
        Ok(Vec::new())
    }
}
fn tracked_directory(root: &Path, cwd: &Path, path: &Path) -> io::Result<String> {
    let relative = relative(root, path)?;
    if !fs::metadata(path)?.is_dir() {
        return Err(error(format!(
            r#"error: adding individual files is blocked ("{}"), and only directories can be added"#,
            display(cwd, path),
        )));
    }
    Ok(relative)
}

pub(super) fn relative(root: &Path, path: &Path) -> io::Result<String> {
    let relative = path
        .strip_prefix(root)
        .map_err(|_| {
            error(format!(
                r#"error: file or directory "{}" is located outside of the workspace."#,
                outside_path(root, path),
            ))
        })?;
    let relative = relative
        .to_str()
        .ok_or_else(|| unsupported("tracking UTF-8 path"))?
        .replace('\\', "/");
    Ok(if relative.is_empty() { ".".into() } else { relative })
}
pub(super) fn normalize(path: &Path) -> PathBuf {
    let mut output = PathBuf::new();
    for part in path.components() {
        match part {
            Component::CurDir => {}
            Component::ParentDir => {
                output.pop();
            }
            other => output.push(other.as_os_str()),
        }
    }
    output
}
fn expand(root: &Path, pattern: &Path, observed: &mut Observed) -> io::Result<Vec<PathBuf>> {
    let pattern = relative(root, pattern)?;
    if pattern.len() > 4096 || pattern.matches('{').count() > 8 || pattern.matches("**").count() > 8
    {
        return Err(unsupported("tracking pattern complexity"));
    }
    let mut directories = vec![root.to_owned()];
    let mut matches = Vec::new();
    while let Some(directory) = directories.pop() {
        for name in observed.directory(&directory)? {
            if matches!(name.as_str(), "node_modules" | ".git" | ".bit" | ".bitTmp") {
                continue;
            }
            let path = directory.join(name);
            glob_entry(root, &path, &pattern, &mut directories, &mut matches)?;
        }
        if directories.len() + matches.len() > 65536 {
            return Err(unsupported("tracking glob limit"));
        }
    }
    matches.sort_by(|left, right| {
        right
            .to_string_lossy()
            .encode_utf16()
            .cmp(left.to_string_lossy().encode_utf16())
    });
    Ok(matches)
}
fn glob_entry(
    root: &Path,
    path: &Path,
    pattern: &str,
    directories: &mut Vec<PathBuf>,
    matches: &mut Vec<PathBuf>,
) -> io::Result<()> {
    let metadata = fs::symlink_metadata(path)?;
    if metadata.file_type().is_symlink() {
        return Err(unsupported("tracking glob symlinks"));
    }
    if bit_workspace_config::glob::matches(pattern, &relative(root, path)?) {
        matches.push(path.to_owned());
    }
    if metadata.is_dir() {
        directories.push(path.to_owned());
    }
    Ok(())
}

fn magic(pattern: &str) -> bool {
    pattern.contains(['*', '?', '[', '{', '('])
}
fn display(cwd: &Path, path: &Path) -> String {
    diagnostic(
        &path
            .strip_prefix(cwd)
            .unwrap_or(path)
            .to_string_lossy(),
    )
}

pub(super) fn diagnostic(path: &str) -> String {
    path.replace('/', std::path::MAIN_SEPARATOR_STR)
}

fn outside_path(root: &Path, path: &Path) -> String {
    let root = root.components().collect::<Vec<_>>();
    let target = path.components().collect::<Vec<_>>();
    let common = root
        .iter()
        .zip(&target)
        .take_while(|(left, right)| left == right)
        .count();
    if common == 0 {
        return path.to_string_lossy().into_owned();
    }
    let mut relative = PathBuf::new();
    for _ in common..root.len() {
        relative.push("..");
    }
    for part in target.into_iter().skip(common) {
        relative.push(part.as_os_str());
    }
    relative.to_string_lossy().into_owned()
}
