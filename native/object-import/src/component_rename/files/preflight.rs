//! Exported rename preflight validates dependent reads without retaining discarded writes.
use super::{Plan, refactor, unsupported};
use serde_json::Value;
use std::{fs, io, path::Path};

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

pub(super) fn overlaid(
    plan: &mut Plan,
    component: &Value,
    relative: &str,
    original: Vec<u8>,
) -> io::Result<Vec<u8>> {
    let Some(path) = component["sourceOverlays"]
        .get(relative)
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|path| !path.is_empty())
    else {
        return Ok(original);
    };
    let root = Path::new(
        component["sourceOverlayRoot"]
            .as_str()
            .map(str::trim)
            .filter(|root| !root.is_empty())
            .ok_or_else(|| unsupported("rename callback source root"))?,
    );
    let path = Path::new(path);
    if !is_private_callback_root(root, path) {
        return Err(unsupported("rename callback source outside private root"));
    }
    let temporary = std::env::temp_dir().canonicalize()?;
    if root
        .parent()
        .ok_or_else(|| unsupported("rename callback source parent"))?
        .canonicalize()?
        != temporary
    {
        return Err(unsupported("rename callback source is not private temporary data"));
    }
    plan.observed.ancestors(
        root,
        path.parent().ok_or_else(|| unsupported("rename callback source path"))?,
    )?;
    super::super::required(&mut plan.observed, path)
}

fn is_private_callback_root(root: &Path, path: &Path) -> bool {
    path.starts_with(root)
        && root
            .file_name()
            .and_then(|name| name.to_str())
            .is_some_and(|name| name.starts_with("bit-native-callback-"))
}
