//! A component's files (`getFilesByDir`): every file under its root dir, minus
//! Bit's scan exclusions, the workspace ignore rules, the generated files Bit
//! owns and the component's own ignore file. The workspace-root component
//! (`.`) also honors nested ignore files and leaves nested components out.

use super::{bitmap::WORKSPACE_ROOT_DIR, ignore::Ignore};
use indexmap::IndexMap;
use std::{
    fs, io,
    path::{Path, PathBuf},
};

/// Ignored everywhere, even with `trackAllFiles`.
pub const ALWAYS_IGNORE_LIST: [&str; 6] = [
    "**/.DS_Store",
    "**/.env",
    "**/.env.local",
    "**/.env.**.local",
    "**/component.json",
    "**/node_modules/**",
];
/// Files Bit generates, ignored unless the workspace sets `trackAllFiles`.
pub const BIT_GENERATED_IGNORE_LIST: [&str; 3] =
    ["package.json", "**/package-lock.json", "**/yarn.lock"];
/// Ignored only at a component's root.
pub const IGNORE_ROOT_ONLY_LIST: [&str; 7] = [
    "tsconfig.json",
    ".eslintrc.json",
    ".prettierrc.cjs",
    ".oxlintrc.json",
    ".oxlintrc.jsonc",
    "oxlint.config.ts",
    "oxlint.config.js",
];
const GIT_IGNORE: &str = ".gitignore";
const BIT_IGNORE: &str = ".bitignore";
/// Directory names a scan never enters (`SCAN_IGNORE_LIST`).
const SKIPPED_DIRS: [&str; 4] = ["node_modules", ".bit", ".git", ".bitTmp"];
const MAX_DEPTH: usize = 128;

fn bit_list(track_all_files: bool) -> Vec<&'static str> {
    let mut list = ALWAYS_IGNORE_LIST.to_vec();
    if !track_all_files {
        list.extend(BIT_GENERATED_IGNORE_LIST);
    }
    list
}

/// parse-gitignore: non-blank lines that do not start with `#`, untrimmed.
fn ignore_file(path: &Path) -> io::Result<Vec<String>> {
    match fs::read_to_string(path) {
        Ok(text) => Ok(text
            .split('\n')
            .map(|line| line.strip_suffix('\r').unwrap_or(line))
            .filter(|line| !line.trim().is_empty() && !line.starts_with('#'))
            .map(str::to_owned)
            .collect()),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(Vec::new()),
        Err(error) => Err(error),
    }
}

/// `retrieveUserIgnoreList`: `.bitignore` when it exists, otherwise `.gitignore`.
pub fn user_ignore_list(dir: &Path) -> io::Result<Vec<String>> {
    let bit_ignore = dir.join(BIT_IGNORE);
    if bit_ignore.exists() { ignore_file(&bit_ignore) } else { ignore_file(&dir.join(GIT_IGNORE)) }
}

/// The workspace's ignore rules (`getGitIgnoreHarmony`) and the scans that use them.
#[derive(Debug, Clone)]
pub struct FileRules {
    root: PathBuf,
    git_ignore: Ignore,
    track_all_files: bool,
}

impl FileRules {
    pub fn load(root: &Path, ignored_files: &[String], track_all_files: bool) -> io::Result<Self> {
        let mut git_ignore = Ignore::new();
        git_ignore
            .add(user_ignore_list(root)?)?
            .add(bit_list(track_all_files))?
            .add(ignored_files)?;
        Ok(Self { root: root.to_owned(), git_ignore, track_all_files })
    }

    /// The files of the component at `dir`, relative to it, sorted like
    /// JavaScript's default sort. Empty when nothing is found or everything is ignored.
    pub fn component_files(
        &mut self,
        dir: &str,
        exclude_dirs: &[String],
    ) -> io::Result<Vec<String>> {
        let scanned = scan(&self.root, dir, exclude_dirs)?;
        if scanned.is_empty() {
            return Ok(Vec::new());
        }
        let filtered = self.filter_by_ignore_files(dir, &scanned)?;
        let prefix = if dir == WORKSPACE_ROOT_DIR {
            String::new()
        } else {
            format!("{}/", dir.trim_end_matches('/'))
        };
        let mut relative: Vec<String> = filtered
            .iter()
            .map(|path| {
                path.strip_prefix(&prefix)
                    .unwrap_or(path)
                    .to_owned()
            })
            .collect();
        if !self.track_all_files {
            relative.retain(|path| !IGNORE_ROOT_ONLY_LIST.contains(&path.as_str()));
        }
        if dir != WORKSPACE_ROOT_DIR {
            let own = user_ignore_list(&self.root.join(dir))?;
            if !own.is_empty() {
                relative = Ignore::new().add(own)?.filter(&relative);
            }
        }
        relative.sort_by(|left, right| left.encode_utf16().cmp(right.encode_utf16()));
        Ok(relative)
    }

    /// `filterByIgnoreFiles`.
    fn filter_by_ignore_files(&mut self, dir: &str, paths: &[String]) -> io::Result<Vec<String>> {
        let filtered = self.git_ignore.filter(paths);
        if dir != WORKSPACE_ROOT_DIR {
            return Ok(filtered);
        }
        let nested = self.nested_ignore_patterns(paths)?;
        if nested.is_empty() {
            return Ok(keep_workspace_map_file(filtered, paths));
        }
        let mut user = Ignore::new();
        user.extend(&self.git_ignore).add(nested)?;
        let by_user = user.filter(paths);
        let filtered = Ignore::new()
            .add(bit_list(self.track_all_files))?
            .filter(&by_user);
        Ok(keep_workspace_map_file(filtered, paths))
    }

    /// Ignore files below the root whose directory is not ignored, shallowest
    /// first, `.bitignore` winning over `.gitignore`, rebased to their directory.
    fn nested_ignore_patterns(&mut self, paths: &[String]) -> io::Result<Vec<String>> {
        let mut patterns = Vec::new();
        for (dir, name) in self.ignore_files_by_dir(paths) {
            let lines = ignore_file(&self.root.join(&dir).join(name))?;
            patterns.extend(lines.iter().map(|pattern| rebase_ignore_pattern(pattern, &dir)));
        }
        Ok(patterns)
    }

    /// The ignore file of each scanned directory below the root, in scan order
    /// then by depth.
    fn ignore_files_by_dir(&mut self, paths: &[String]) -> Vec<(String, &'static str)> {
        let mut by_dir: IndexMap<String, &'static str> = IndexMap::new();
        for path in paths {
            let Some((file_dir, name)) = path.rsplit_once('/') else { continue };
            let name = match name {
                GIT_IGNORE => GIT_IGNORE,
                BIT_IGNORE => BIT_IGNORE,
                _ => continue,
            };
            // git does not descend into an ignored directory.
            if self.git_ignore.ignores(&format!("{file_dir}/")) {
                continue;
            }
            if name == BIT_IGNORE || !by_dir.contains_key(file_dir) {
                by_dir.insert(file_dir.to_owned(), name);
            }
        }
        let mut by_dir: Vec<_> = by_dir.into_iter().collect();
        by_dir.sort_by_key(|(dir, _)| dir.split('/').count());
        by_dir
    }
}

/// `.bitmap` stays tracked by the workspace-root component whatever the ignore rules say.
fn keep_workspace_map_file(mut filtered: Vec<String>, paths: &[String]) -> Vec<String> {
    if !filtered
        .iter()
        .any(|path| path == super::bitmap::BITMAP)
        && paths
            .iter()
            .any(|path| path == super::bitmap::BITMAP)
    {
        filtered.push(super::bitmap::BITMAP.to_owned());
    }
    filtered
}

/// `rebaseIgnorePattern`: a pattern with a slash before its end is anchored to
/// `dir`, any other matches at any depth below it.
#[must_use]
pub fn rebase_ignore_pattern(pattern: &str, dir: &str) -> String {
    let dir = dir.trim();
    let (negated, body) = pattern
        .strip_prefix('!')
        .map_or((false, pattern), |body| (true, body));
    let anchored = body.len() > 1 && body[..body.len() - 1].contains('/');
    let dir_only = if body.ends_with('/') { "/" } else { "" };
    let base = if anchored {
        join_linux(&[dir, body.strip_prefix('/').unwrap_or(body)])
    } else {
        join_linux(&[dir, "**", body])
    };
    let rebased = format!("{base}{dir_only}");
    if negated { format!("!{rebased}") } else { rebased }
}

/// `pathJoinLinux`: `path.join` then normalize-path (which drops a trailing slash).
fn join_linux(parts: &[&str]) -> String {
    let mut segments: Vec<&str> = Vec::new();
    for segment in parts
        .iter()
        .flat_map(|part| part.split('/'))
    {
        match segment {
            "" | "." => {}
            ".." if segments
                .last()
                .is_some_and(|last| *last != "..") =>
            {
                segments.pop();
            }
            _ => segments.push(segment),
        }
    }
    if segments.is_empty() { ".".to_owned() } else { segments.join("/") }
}

/// The scan before ignore files: workspace-relative `/` paths of the files
/// under `dir`. The workspace root does not follow symbolic links; other
/// component dirs do.
fn scan(root: &Path, dir: &str, exclude_dirs: &[String]) -> io::Result<Vec<String>> {
    let dir = dir.trim();
    let workspace_root = dir == WORKSPACE_ROOT_DIR;
    let start = if workspace_root { String::new() } else { dir.trim_end_matches('/').to_owned() };
    let excluded: Vec<String> = exclude_dirs
        .iter()
        .map(|dir| format!("{}/", dir.trim().trim_end_matches('/')))
        .collect();
    let mut scan = Scan { root, workspace_root, start: start.clone(), excluded, files: Vec::new() };
    scan.walk(&start, 0)?;
    let mut files = scan.files;
    files.sort_by(|left, right| left.encode_utf16().cmp(right.encode_utf16()));
    Ok(files)
}

struct Scan<'a> {
    root: &'a Path,
    workspace_root: bool,
    start: String,
    excluded: Vec<String>,
    files: Vec<String>,
}

impl Scan<'_> {
    fn walk(&mut self, relative: &str, depth: usize) -> io::Result<()> {
        if depth > MAX_DEPTH {
            return Ok(());
        }
        let entries = match fs::read_dir(self.root.join(relative)) {
            Ok(entries) => entries,
            Err(error)
                if matches!(
                    error.kind(),
                    io::ErrorKind::NotFound | io::ErrorKind::NotADirectory,
                ) =>
            {
                return Ok(());
            }
            Err(error) => return Err(error),
        };
        for entry in entries {
            let entry = entry?;
            let Some(name) = entry
                .file_name()
                .to_str()
                .map(str::to_owned)
            else {
                continue;
            };
            let path =
                if relative.is_empty() { name.clone() } else { format!("{relative}/{name}") };
            self.visit(&entry, &name, path, depth)?;
        }
        Ok(())
    }

    fn visit(
        &mut self,
        entry: &fs::DirEntry,
        name: &str,
        path: String,
        depth: usize,
    ) -> io::Result<()> {
        if SKIPPED_DIRS.contains(&name)
            || self.excluded
                .iter()
                .any(|dir| format!("{path}/").starts_with(dir))
        {
            return Ok(());
        }
        let file_type = entry.file_type()?;
        if file_type.is_symlink() && self.workspace_root {
            return Ok(());
        }
        let metadata = if file_type.is_symlink() { fs::metadata(entry.path()).ok() } else { None };
        let is_dir = metadata.as_ref().map_or_else(|| file_type.is_dir(), fs::Metadata::is_dir);
        let is_file = metadata.as_ref().map_or_else(|| file_type.is_file(), fs::Metadata::is_file);
        if is_dir {
            return self.walk(&path, depth + 1);
        }
        if is_file && !self.scan_ignored_file(name, &path) {
            self.files.push(path);
        }
        Ok(())
    }

    /// `.bit.map.json` anywhere; a `.bitmap` other than the root's own.
    fn scan_ignored_file(&self, name: &str, path: &str) -> bool {
        if name == ".bit.map.json" {
            return true;
        }
        if name != super::bitmap::BITMAP {
            return false;
        }
        if self.workspace_root {
            path.contains('/')
        } else {
            path == format!("{}/{}", self.start, name)
        }
    }
}
