use super::{Change, Plan, Value, dependent_file, refactor, unsupported};
use std::io;
pub(in crate::component_rename) fn packages_all(
    plan: &mut Plan,
    matchers: &mut refactor::PackageMatchers,
) -> io::Result<bool> {
    let mut changed = false;
    for file in &mut plan.files {
        let before = file.bytes.clone();
        file.bytes = matchers.apply(&file.bytes)?;
        changed |= file.bytes != before;
    }
    if plan.options.preserve && !changed {
        plan.files.clear();
    }
    Ok(changed)
}
pub(in crate::component_rename) fn batch_dependents(
    plan: &mut Plan,
    rows: &[Value],
    pairs: &[(String, String)],
    targets: &[String],
) -> io::Result<(Vec<Change>, Vec<String>)> {
    let mut matchers = refactor::PackageMatchers::new(pairs);
    let mut output = Vec::new();
    let mut identities = Vec::new();
    for row in rows {
        let id =
            row["identity"].as_str().ok_or_else(|| unsupported("scope rename loaded identity"))?;
        if targets
            .iter()
            .any(|target| target == id)
        {
            continue;
        }
        let changes = batch_component(plan, row, &mut matchers)?;
        if !changes.is_empty() {
            identities.push(id.to_owned());
            output.extend(changes);
        }
    }
    Ok((output, identities))
}
fn batch_component(
    plan: &mut Plan,
    row: &Value,
    matchers: &mut refactor::PackageMatchers,
) -> io::Result<Vec<Change>> {
    let directory =
        row["directory"].as_str().ok_or_else(|| unsupported("scope rename loaded directory"))?;
    let mut component = row.clone();
    component["rootDir"] = Value::String(directory.into());
    let files = row["files"].as_array().ok_or_else(|| unsupported("scope rename loaded files"))?;
    let mut changes = Vec::new();
    let mut changed = false;
    for file in files {
        let relative = file
            .as_str()
            .or_else(|| file["relativePath"].as_str())
            .ok_or_else(|| unsupported("scope rename loaded path"))?;
        let (mut change, _) = dependent_file(plan, &component, directory, relative, ("", ""))?;
        let before = change.bytes.clone();
        change.bytes = matchers.apply(&change.bytes)?;
        changed |= before != change.bytes;
        changes.push(change);
    }
    Ok(if changed { changes } else { Vec::new() })
}

/// Workspace.write precedes `ComponentWriter`, so existing injected hardlinks see import changes.
pub(in crate::component_rename) fn workspace_refactor(plan: &mut Plan) -> io::Result<()> {
    super::validate(plan)?;
    for file in &mut plan.files {
        std::fs::write(&file.source, &file.bytes)?;
        file.before.clone_from(&file.bytes);
    }
    super::super::cleanup::prepare(plan)
}
