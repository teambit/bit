//! Directory scanning ([`read`]), ignore filtering, and file ordering for `bit add` component tracking.

use super::{Plan, error, paths, unsupported};
use crate::workspace::engine::inventory;
use serde_json::Value;
use std::{collections::HashSet, io, path::Path};
/// Glob patterns that are always ignored during `bit add` directory scans.
const ALWAYS: &[&str] = &[
    "**/.DS_Store",
    "**/.env",
    "**/.env.local",
    "**/.env.**.local",
    "**/component.json",
    "**/node_modules/**",
];
/// Generated package and lockfile glob patterns excluded unless `trackAllFiles` is enabled.
const GENERATED: &[&str] = &["package.json", "**/package-lock.json", "**/yarn.lock"];
/// Tooling config files ignored only at the component root directory unless `trackAllFiles` is enabled.
const ROOT_ONLY: &[&str] = &[
    "tsconfig.json",
    ".eslintrc.json",
    ".prettierrc.cjs",
    ".oxlintrc.json",
    ".oxlintrc.jsonc",
    "oxlint.config.ts",
    "oxlint.config.js",
];

/// Scans `directory`, applies ignore rules from [`Value`] `facts`, and returns ordered relative file paths for [`Plan`].
pub(super) fn read(
    plan: &mut Plan,
    directory: &str,
    batch: &[String],
    facts: &Value,
) -> io::Result<Vec<String>> {
    let absolute = plan.root.join(directory);
    plan.observed.read(&absolute.join("component.json"))?;
    plan.observed.read(&absolute.join("package.json"))?;
    let excluded = excluded(plan, directory, batch);
    let scanned = inventory::tracking_scan(&absolute, &excluded, directory == ".")?;
    let mut paths = scanned
        .iter()
        .map(|path| paths::relative(&plan.root, Path::new(path)))
        .collect::<io::Result<Vec<_>>>()?;
    order(&mut paths);
    if paths.is_empty() {
        return Err(error(format!(
            r#"directory "{}" is empty, no files to add"#,
            absolute.display(),
        )));
    }
    let kept =
        filtered(plan, directory, &paths, super::identity::workspace_aspect(&facts["workspace"]))?;
    let original = paths;
    let mut kept = kept;
    if kept.is_empty() {
        return Err(error(format!(
            "warning: no files to add, the following files were ignored: {}",
            original
                .iter()
                .map(|path| paths::diagnostic(path))
                .collect::<Vec<_>>()
                .join(", "),
        )));
    }
    retained_directories(plan, directory, &scanned)?;
    order(&mut kept);
    Ok(kept)
}
/// Filter scanned relative `paths` in `directory` against workspace and default [`ALWAYS`]/[`GENERATED`] ignore patterns.
fn filtered(
    plan: &mut Plan,
    directory: &str,
    paths: &[String],
    settings: &Value,
) -> io::Result<Vec<String>> {
    let track_all = bit_workspace_config::truthy(&settings["trackAllFiles"]);
    let patterns = patterns(plan, settings, track_all)?;
    let mut paths = inventory::tracking_filter(paths, &patterns)?;
    if !track_all {
        paths.retain(|path| !is_root_only(directory, path));
    }
    paths = own(plan, &paths)?;
    let mut kept = Vec::new();
    for path in paths {
        if generated(plan, &path, track_all, directory == ".")? {
            continue;
        }
        kept.push(path);
    }
    Ok(kept)
}

/// Return `true` when `path` is a root-level tooling configuration file in [`ROOT_ONLY`] inside `directory`.
#[inline]
fn is_root_only(directory: &str, path: &str) -> bool {
    let rel = if directory == "." {
        Some(path)
    } else {
        path.strip_prefix(directory)
            .and_then(|rest| rest.strip_prefix('/'))
    };
    rel.is_some_and(|rel| ROOT_ONLY.contains(&rel))
}

fn patterns(plan: &mut Plan, settings: &Value, track_all: bool) -> io::Result<Vec<String>> {
    let mut patterns = inventory::tracking_ignore(&plan.root)?;
    observe_ignore(plan, ".")?;
    patterns.extend(ALWAYS.iter().map(|pattern| (*pattern).to_owned()));
    if !track_all {
        patterns.extend(GENERATED.iter().map(|pattern| (*pattern).to_owned()));
    }
    if let Some(ignored) = settings["ignoredFiles"].as_array() {
        if ignored.len() > 4096 {
            return Err(unsupported("tracking ignoredFiles limit"));
        }
        patterns.extend(
            ignored
                .iter()
                .filter_map(Value::as_str)
                .map(str::trim)
                .filter(|pattern| !pattern.is_empty())
                .map(str::to_owned),
        );
    }
    Ok(patterns)
}
fn own(plan: &mut Plan, paths: &[String]) -> io::Result<Vec<String>> {
    let mut kept = paths.to_vec();
    let directories = ignore_directories(paths);
    for parent in directories {
        let patterns = inventory::tracking_ignore(&plan.root.join(&parent))?;
        observe_ignore(plan, &parent)?;
        if patterns.is_empty() {
            continue;
        }
        let prefix = format!("{parent}/");
        let local = kept
            .iter()
            .filter_map(|path| path.strip_prefix(&prefix).map(str::to_owned))
            .collect::<Vec<_>>();
        let allowed =
            inventory::tracking_filter(&local, &patterns)?.into_iter().collect::<HashSet<_>>();
        kept.retain(|path| {
            path.strip_prefix(&prefix)
                .is_none_or(|path| allowed.contains(path))
        });
    }
    Ok(kept)
}
fn ignore_directories(paths: &[String]) -> Vec<String> {
    let mut directories = HashSet::new();
    for path in paths {
        for parent in Path::new(path).ancestors().skip(1) {
            let parent = parent.to_string_lossy().replace('\\', "/");
            if !parent.is_empty() {
                directories.insert(parent);
            }
        }
    }
    let mut directories = directories.into_iter().collect::<Vec<_>>();
    directories.sort_by_key(|directory| directory.matches('/').count());
    directories
}

#[inline]
fn observe_ignore(plan: &mut Plan, directory: &str) -> io::Result<()> {
    let dir = plan.root.join(directory);
    plan.observed.read(&dir.join(".bitignore"))?;
    plan.observed.read(&dir.join(".gitignore"))?;
    Ok(())
}
fn generated(
    plan: &mut Plan,
    path: &str,
    track_all: bool,
    workspace_root: bool,
) -> io::Result<bool> {
    let bytes = plan.observed
        .read(&plan.root.join(path))?
        .ok_or_else(|| unsupported("tracking source disappeared"))?;
    let first = bytes
        .split(|byte| matches!(*byte, b'\n' | b'\r'))
        .next()
        .unwrap_or_default();
    let head = &first[..first.len().min(1024)];
    Ok(!(track_all || workspace_root && path == ".bitmap")
        && String::from_utf8_lossy(head).contains("BIT-AUTO-GENERATED"))
}
fn excluded(plan: &Plan, directory: &str, batch: &[String]) -> Vec<std::path::PathBuf> {
    let mut directories = batch.to_vec();
    if directory == "."
        && let Some(rows) = plan.bitmap.as_object()
    {
        directories.extend(
            rows.values()
                .filter(|row| super::active(row))
                .filter_map(|row| row["rootDir"].as_str().map(str::trim))
                .filter(|dir| !dir.is_empty())
                .map(str::to_owned),
        );
    }
    directories
        .into_iter()
        .filter(|other| {
            other != directory
                && (directory == "."
                    || other
                        .strip_prefix(directory)
                        .is_some_and(|rest| rest.starts_with('/')))
        })
        .map(|directory| plan.root.join(directory))
        .chain(std::iter::once(crate::scope_path(&plan.root)))
        .collect()
}
fn retained_directories(plan: &mut Plan, directory: &str, files: &[String]) -> io::Result<()> {
    let root = plan.root.join(directory);
    let mut parents = HashSet::new();
    parents.insert(root.clone());
    for file in files {
        for parent in Path::new(file)
            .ancestors()
            .skip(1)
            .take_while(|parent| parent.starts_with(&root))
        {
            parents.insert(parent.to_owned());
        }
    }
    for parent in parents {
        plan.observed.directory(&parent)?;
    }
    Ok(())
}

fn order(files: &mut [String]) {
    files.sort_by(|left, right| {
        left.matches('/')
            .count()
            .cmp(&right.matches('/').count())
            .then_with(|| right.encode_utf16().cmp(left.encode_utf16()))
    });
}
