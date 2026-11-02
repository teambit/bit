//! [`validate`] ownership boundaries, [`select_pattern`], and [`matches_identity`] before selecting or combining checkout targets.

use super::invalid;
use serde_json::Value;
use std::io;

/// Verifies that no two target directories in `targets` are equal or nested inside one another.
#[inline]
pub(super) fn validate(targets: &[Value]) -> io::Result<()> {
    let mut roots = targets
        .iter()
        .map(|target| {
            let raw = target["directory"]
                .as_str()
                .or_else(|| target["rootDir"].as_str())
                .map(str::trim)
                .filter(|root| !root.is_empty())
                .ok_or_else(|| invalid("command component root"))?;
            let stripped = raw
                .strip_prefix("./")
                .unwrap_or(raw)
                .trim_end_matches('/');
            Ok(if stripped.is_empty() { "." } else { stripped })
        })
        .collect::<io::Result<Vec<_>>>()?;
    roots.sort_unstable_by(|left, right| {
        std::path::Path::new(left).cmp(std::path::Path::new(right))
    });
    let total = roots.len();
    roots.retain(|root| *root != ".");
    if total - roots.len() > 1 {
        return Err(invalid("command duplicate workspace root"));
    }
    if roots
        .windows(2)
        .any(|pair| std::path::Path::new(pair[1]).starts_with(pair[0]))
    {
        return Err(invalid("command nested component roots"));
    }
    Ok(())
}

/// Selects workspace `targets` matching a directory path or simple component identity `pattern`.
pub(super) fn select_pattern(targets: &[Value], pattern: &str) -> io::Result<Vec<Value>> {
    let normalized = pattern.trim().replace('\\', "/");
    let directory = normalized
        .strip_prefix("./")
        .unwrap_or(&normalized)
        .trim_end_matches('/');
    if directory.is_empty()
        || directory
            .split('/')
            .any(|part| matches!(part, "" | "." | ".."))
    {
        return Err(invalid("command complex component pattern"));
    }
    if let Some(target) = targets
        .iter()
        .find(|target| {
            target["directory"]
                .as_str()
                .or_else(|| target["rootDir"].as_str())
                .map(str::trim)
                .map(|dir| {
                    dir.strip_prefix("./")
                        .unwrap_or(dir)
                        .trim_end_matches('/')
                })
                .is_some_and(|dir| dir == directory)
        })
    {
        return Ok(vec![target.clone()]);
    }
    let selected = targets
        .iter()
        .filter(|target| matches_identity(target, &normalized))
        .cloned()
        .collect::<Vec<_>>();
    if selected.len() != 1 {
        return Err(invalid("command exact selection requires one component"));
    }
    Ok(selected)
}

/// Returns `true` when `target`'s unversioned identity or tail component name matches `pattern`.
#[inline]
fn matches_identity(target: &Value, pattern: &str) -> bool {
    let pattern = pattern.trim();
    let bare = pattern
        .split('@')
        .next()
        .unwrap_or(pattern)
        .trim()
        .trim_end_matches('/');
    target["identity"]
        .as_str()
        .or_else(|| target["id"].as_str())
        .map(str::trim)
        .map(|raw| {
            raw.split('@')
                .next()
                .unwrap_or(raw)
                .trim()
        })
        .is_some_and(|identity| {
            identity == bare
                || identity
                    .split_once('/')
                    .is_some_and(|(_, name)| name.trim() == bare)
        })
}
