//! The dependency sections of `diffMetadata`: `packageDependenciesOutput`,
//! `componentDependenciesOutput` and `formatDepsDiffAsPlainText`.

use super::{
    super::super::{color::Chalk, ids::Id},
    Labels,
};
use crate::commands::status::js::{decline, text};
use node_semver::npm;
use serde_json::{Map, Value};
use std::io;

/// One dependency change: name, and the version on each side.
struct Change {
    name: String,
    left: Option<String>,
    right: Option<String>,
}

/// `getDepDiffType`: only its failure matters to the plain-text output.
fn check_change(left: Option<&str>, right: Option<&str>) -> io::Result<()> {
    let present = |value: Option<&str>| {
        value
            .map(str::trim)
            .is_some_and(|value| !value.is_empty())
    };
    if !present(left) && !present(right) {
        return Err(decline("diff.getType expect at least one of the component to have value"));
    }
    if let (Some(left), Some(right)) = (left.map(str::trim), right.map(str::trim)) {
        let _ = npm::compare(left, right, true);
    }
    Ok(())
}

/// `packageDependenciesOutput`.
pub(super) fn package_dependencies(
    left: &Map<String, Value>,
    right: &Map<String, Value>,
    field: &str,
    labels: &Labels,
    chalk: Chalk,
) -> io::Result<Option<String>> {
    if left.is_empty() && right.is_empty() {
        return Ok(None);
    }
    let mut changes = Vec::new();
    for name in left.keys() {
        let (ours, theirs) = (pkg_version(left, name)?, pkg_version(right, name)?);
        if ours.is_none() || ours == theirs {
            continue;
        }
        check_change(ours.as_deref(), theirs.as_deref())?;
        changes.push(Change { name: name.clone(), left: ours, right: theirs });
    }
    for name in right.keys() {
        if pkg_version(left, name)?.is_none()
            && let Some(theirs) = pkg_version(right, name)?
        {
            check_change(None, Some(theirs.as_str()))?;
            changes.push(Change { name: name.clone(), left: None, right: Some(theirs) });
        }
    }
    Ok(plain_text(&changes, field, labels, chalk))
}

fn pkg_version(map: &Map<String, Value>, name: &str) -> io::Result<Option<String>> {
    map.get(name.trim())
        .map(|value| text(Some(value)).map(|ver| ver.trim().to_string()))
        .transpose()
        .map(|opt| opt.filter(|ver| !ver.is_empty()))
}

/// `componentDependenciesOutput`.
pub(super) fn component_dependencies(
    left: &[Id],
    right: &[Id],
    field: &str,
    labels: &Labels,
    chalk: Chalk,
) -> io::Result<Option<String>> {
    if left.is_empty() && right.is_empty() {
        return Ok(None);
    }
    let mut changes = Vec::new();
    for ours in left {
        let theirs = right
            .iter()
            .find(|id| id.same_without_version(ours));
        if theirs.is_some_and(|theirs| ours.same(theirs)) {
            continue;
        }
        let theirs_version = theirs.and_then(|id| id.version.clone());
        check_change(ours.version.as_deref(), theirs_version.as_deref())?;
        changes.push(Change {
            name: ours.without_version(),
            left: ours.version.clone(),
            right: theirs_version,
        });
    }
    for theirs in right {
        if !left
            .iter()
            .any(|id| id.same_without_version(theirs))
        {
            check_change(None, theirs.version.as_deref())?;
            changes.push(Change {
                name: theirs.without_version(),
                left: None,
                right: theirs.version.clone(),
            });
        }
    }
    Ok(plain_text(&changes, field, labels, chalk))
}

/// `formatDepsDiffAsPlainText`.
fn plain_text(changes: &[Change], field: &str, labels: &Labels, chalk: Chalk) -> Option<String> {
    if changes.is_empty() {
        return None;
    }
    let field = field.trim();
    let side = |sign: &str, name: &str, version: &Option<String>| match version
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        Some(version) => format!("{sign} {name}@{version}\n"),
        None => String::new(),
    };
    let rows: Vec<String> = changes
        .iter()
        .map(|change| {
            let left = side("-", &change.name, &change.left);
            let right = side("+", &change.name, &change.right);
            format!("{}\n{}{}", change.name, chalk.red(&left), chalk.green(&right))
        })
        .collect();
    let title = format!(
        "--- {field} {}\n{}",
        labels.left,
        chalk.bold(&format!("+++ {field} {}", labels.right)),
    );
    Some(format!("\n{title}\n{}", rows.join("\n")))
}
