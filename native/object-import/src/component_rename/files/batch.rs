//! Multi-package string replacement ([`packages_all`], [`batch_dependents`]) across renamed component files and dependent components.

use super::{Change, Plan, Value, dependent_file, refactor, unsupported};
use std::io;
/// Applies multi-package `matchers` across all source files in `plan` and reports whether bytes changed.
#[inline]
pub(in crate::component_rename) fn packages_all(
    plan: &mut Plan,
    matchers: &mut refactor::PackageMatchers,
) -> io::Result<bool> {
    let mut changed = false;
    for file in &mut plan.files {
        let replaced = matchers.apply(&file.bytes)?;
        changed |= replaced != file.bytes;
        file.bytes = replaced;
    }
    if plan.options.preserve && !changed {
        plan.files.clear();
    }
    Ok(changed)
}
/// Apply `pairs` package replacements across dependent component `rows` not in `targets`.
pub(in crate::component_rename) fn batch_dependents(
    plan: &mut Plan,
    rows: &[Value],
    pairs: &[(String, String)],
    targets: &[String],
) -> io::Result<(Vec<Change>, Vec<String>)> {
    let mut matchers = refactor::PackageMatchers::with_cache(pairs, &plan.context.patterns);
    let mut initial = refactor::PackageMatcher::new("", "");
    let mut output = Vec::new();
    let mut identities = Vec::new();
    for row in rows {
        let id = row_identity(row).ok_or_else(|| unsupported("scope rename loaded identity"))?;
        if targets
            .iter()
            .any(|target| {
                let bare = target
                    .trim()
                    .rsplit_once('@')
                    .map_or_else(|| target.trim(), |(prefix, _)| prefix);
                bare.trim() == id
            })
        {
            continue;
        }
        let changes = batch_component(plan, row, &mut matchers, &mut initial)?;
        if !changes.is_empty() {
            identities.push(id);
            output.extend(changes);
        }
    }
    Ok((output, identities))
}

/// Extract the bare `<scope>/<name>` or `<name>` component identity from a loaded component `row`.
fn row_identity(row: &Value) -> Option<String> {
    if let Some(identity) = row["identity"]
        .as_str()
        .or_else(|| row["id"].as_str())
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        let bare = identity
            .rsplit_once('@')
            .map_or(identity, |(prefix, _)| prefix)
            .trim();
        return (!bare.is_empty()).then(|| bare.to_owned());
    }
    let object = row["id"].as_object()?;
    let raw_name = object
        .get("name")?
        .as_str()
        .map(str::trim)
        .filter(|value| !value.is_empty())?;
    let name = raw_name
        .rsplit_once('@')
        .map_or(raw_name, |(prefix, _)| prefix)
        .trim();
    if name.is_empty() {
        return None;
    }
    match object
        .get("scope")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        Some(scope) => Some(format!("{scope}/{name}")),
        None => Some(name.to_owned()),
    }
}

/// Apply `matchers` across all source files of a single dependent component `row`.
fn batch_component(
    plan: &mut Plan,
    row: &Value,
    matchers: &mut refactor::PackageMatchers,
    initial: &mut refactor::PackageMatcher,
) -> io::Result<Vec<Change>> {
    let directory = row["directory"]
        .as_str()
        .or_else(|| row["rootDir"].as_str())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| unsupported("scope rename loaded directory"))?;
    let files = row["files"]
        .as_array()
        .filter(|rows| rows.len() <= 16_384)
        .ok_or_else(|| unsupported("scope rename loaded files"))?;
    let mut changes = Vec::with_capacity(files.len());
    let mut changed = false;
    for file in files {
        let relative = file
            .as_str()
            .or_else(|| file["relativePath"].as_str())
            .or_else(|| file["path"].as_str())
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .ok_or_else(|| unsupported("scope rename loaded path"))?;
        let (mut change, _) = dependent_file(plan, row, directory, relative, initial)?;
        let replaced = matchers.apply(&change.bytes)?;
        changed |= replaced != change.bytes;
        change.bytes = replaced;
        changes.push(change);
    }
    Ok(if changed { changes } else { Vec::new() })
}

/// Workspace.write precedes `ComponentWriter`, so existing injected hardlinks see import changes.
#[inline]
pub(in crate::component_rename) fn workspace_refactor(plan: &mut Plan) -> io::Result<()> {
    super::validate(plan)?;
    for file in &mut plan.files {
        std::fs::write(&file.source, &file.bytes)?;
        file.before.clone_from(&file.bytes);
    }
    super::super::cleanup::prepare(plan)
}
