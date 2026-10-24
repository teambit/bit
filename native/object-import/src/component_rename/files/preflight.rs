//! Exported rename preflight validates dependent reads without retaining discarded writes.
use super::{Plan, overlaid, refactor, unsupported};
use serde_json::Value;
use std::{fs, io};

pub(super) fn dependent(
    plan: &mut Plan,
    component: &Value,
    directory: &str,
    relative: &str,
    matcher: &mut refactor::PackageMatcher,
) -> io::Result<()> {
    let path = plan.root.join(directory).join(relative);
    plan.observed.ancestors(
        &plan.root,
        path.parent().ok_or_else(|| unsupported("rename dependent parent"))?,
    )?;
    let before = super::super::required(&mut plan.observed, &path)?;
    let loaded = overlaid(plan, component, relative, before)?;
    matcher.apply(&loaded)?;
    fs::metadata(&path)?;
    Ok(())
}
