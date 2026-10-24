use super::{Cleanup, LocalBatch};
use crate::component_remove::{RowKind, Selected, VersionedPlan, batch, invalid, select};
use serde_json::Value;
use std::{fs, io, path::Path};

pub(super) fn prepare(
    root: &Path,
    identities: &[String],
    keep: bool,
    track: bool,
    components: &[Value],
) -> io::Result<LocalBatch> {
    let before = fs::read(root.join(".bitmap"))?;
    let mut bitmap = crate::parse_jsonc(&before)?;
    let mut selected = Vec::new();
    let mut models = Vec::new();
    for id in identities {
        let (row, model) = entry(root, &bitmap, id, keep)?;
        selected.push(row);
        if let Some(model) = model {
            models.push(model);
        }
    }
    packages(root, &mut selected, &mut models, components)?;
    let proofs = proofs(root, &selected)?;
    let cleanup = Cleanup::prepare(root, &bitmap, &selected, components)?;
    for row in &selected {
        bitmap
            .as_object_mut()
            .ok_or_else(|| invalid("component bitmap"))?
            .shift_remove(&row.key);
    }
    Ok(LocalBatch {
        root: root.into(),
        before,
        after: crate::inspection::render_workspace_bitmap(&bitmap)?,
        selected,
        models,
        cleanup,
        track,
        proofs,
    })
}
fn packages(
    root: &Path,
    selected: &mut [Selected],
    models: &mut [VersionedPlan],
    components: &[Value],
) -> io::Result<()> {
    batch::custom_packages(root, selected, components)?;
    for row in &mut *selected {
        if !row.main_exists {
            row.package.clear();
        }
    }
    for model in models {
        if let Some(row) = selected
            .iter()
            .find(|row| row.identity == model.identity())
        {
            model.package_path(row.package.clone());
        }
    }
    Ok(())
}

fn entry(
    root: &Path,
    bitmap: &Value,
    id: &str,
    keep: bool,
) -> io::Result<(Selected, Option<VersionedPlan>)> {
    if let Ok(row) = select(root, bitmap, id, keep, RowKind::New) {
        return Ok((row, None));
    }
    for kind in [RowKind::Staged, RowKind::Imported, RowKind::LaneSnap] {
        let Ok(model) = model(root, id, keep, kind) else { continue };
        return Ok((select(root, bitmap, id, keep, kind)?, Some(model)));
    }
    Err(invalid("component scope state requires canonical removal"))
}
fn model(root: &Path, id: &str, keep: bool, kind: RowKind) -> io::Result<VersionedPlan> {
    match kind {
        RowKind::Staged => VersionedPlan::prepare(root, id, keep),
        RowKind::Imported => VersionedPlan::prepare_imported(root, id, keep),
        _ => VersionedPlan::prepare_lane_snap(root, id, keep, false),
    }
}

fn proofs(
    root: &Path,
    selected: &[Selected],
) -> io::Result<crate::component_tracking::observe::Observed> {
    let mut proofs = crate::component_tracking::observe::Observed::default();
    proofs.ancestors(root, root)?;
    let scope = crate::scope_path(root);
    if scope.is_dir() {
        proofs.ancestors(root, &scope)?;
    }
    proofs.read(&scope.join("index.json"))?;
    proofs.read(&scope.join("unmerged.json"))?;
    let paths = selected
        .iter()
        .flat_map(|row| {
            row.files
                .iter()
                .chain(std::iter::once(&row.package))
        })
        .filter(|path| !path.as_os_str().is_empty());
    for path in paths {
        let parent = path
            .ancestors()
            .find(|path| path.is_dir())
            .ok_or_else(|| invalid("component path ancestor"))?;
        proofs.ancestors(root, parent)?;
    }
    Ok(proofs)
}
