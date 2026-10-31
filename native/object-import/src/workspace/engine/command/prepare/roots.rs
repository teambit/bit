//! Validate ownership boundaries before selecting or combining checkout targets.
use super::invalid;
use serde_json::Value;
use std::io;

pub(super) fn validate(targets: &[Value]) -> io::Result<()> {
    let mut roots = targets
        .iter()
        .map(|target| {
            target["directory"]
                .as_str()
                .or_else(|| target["rootDir"].as_str())
                .ok_or_else(|| invalid("command component root"))
        })
        .collect::<io::Result<Vec<_>>>()?;
    roots.sort_unstable_by(|left, right| {
        std::path::Path::new(left).cmp(std::path::Path::new(right))
    });
    if roots
        .iter()
        .filter(|root| **root == ".")
        .count()
        > 1
    {
        return Err(invalid("command duplicate workspace root"));
    }
    roots.retain(|root| *root != ".");
    if roots
        .windows(2)
        .any(|pair| std::path::Path::new(pair[1]).starts_with(pair[0]))
    {
        return Err(invalid("command nested component roots"));
    }
    Ok(())
}

pub(super) fn select_pattern(targets: &[Value], pattern: &str) -> io::Result<Vec<Value>> {
    let normalized = pattern.replace('\\', "/");
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
                .is_some_and(|dir| dir.trim_end_matches('/') == directory)
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

fn matches_identity(target: &Value, pattern: &str) -> bool {
    let bare = pattern
        .split('@')
        .next()
        .unwrap_or(pattern)
        .trim_end_matches('/');
    target["identity"]
        .as_str()
        .or_else(|| target["id"].as_str())
        .map(|raw| raw.split('@').next().unwrap_or(raw))
        .is_some_and(|identity| {
            identity == bare
                || identity
                    .split_once('/')
                    .is_some_and(|(_, name)| name == bare)
        })
}
