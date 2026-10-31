use super::{Action, Batch, invalid};
use std::{fs, io, path::Path};
pub(super) fn commit(batch: &Batch, file_id: &str) -> io::Result<()> {
    crate::component_remove::validate_file_id(file_id)?;
    batch.validate()?;
    if batch.items
        .iter()
        .any(|item| item.action == Action::ProbeRemote)
    {
        return Err(invalid("recovery remote classification incomplete"));
    }
    let mut bitmap = batch.bitmap.clone();
    for item in &batch.items {
        for file in &item.files {
            destination(&batch.root, &file.path)?;
        }
        if let Some(config) = &item.configuration {
            destination(&batch.root, &config.path)?;
        }
        super::classification::update(&mut bitmap, item)?;
    }
    publish_files(batch)?;
    if bitmap != batch.bitmap {
        crate::component_remove::backup_bitmap(&batch.root, file_id, "recover")?;
        let bytes = crate::inspection::render_workspace_bitmap(&bitmap)?;
        fs::write(batch.root.join(".bitmap"), bytes)?;
    }
    Ok(())
}
fn publish_files(batch: &Batch) -> io::Result<()> {
    for item in &batch.items {
        for file in &item.files {
            destination(&batch.root, &file.path)?;
            if let Some(parent) = file.path.parent() {
                fs::create_dir_all(parent)?;
            }
            fs::write(&file.path, &file.bytes)?;
        }
        if let Some(config) = &item.configuration {
            destination(&batch.root, &config.path)?;
            fs::write(&config.path, &config.bytes)?;
        }
    }
    Ok(())
}
pub(super) fn destination(root: &Path, target: &Path) -> io::Result<()> {
    let relative = target.strip_prefix(root).map_err(io::Error::other)?;
    let mut path = root.to_owned();
    for component in relative.components() {
        path.push(component);
        match fs::symlink_metadata(&path) {
            Ok(metadata) if metadata.file_type().is_symlink() => {
                return Err(invalid("recovery destination symlink"));
            }
            Ok(metadata) if path != target && !metadata.is_dir() => {
                return Err(invalid("recovery destination parent is not a directory"));
            }
            Ok(metadata) if path == target && !metadata.is_file() => {
                return Err(invalid("recovery destination is not a file"));
            }
            Err(error) if error.kind() == io::ErrorKind::NotFound => {}
            Err(error) => return Err(error),
            _ => {}
        }
    }
    Ok(())
}
pub(super) fn existing_ancestors(batch: &mut Batch, target: &Path) -> io::Result<()> {
    destination(&batch.root, target)?;
    let parent = target
        .ancestors()
        .skip(1)
        .find(|parent| parent.is_dir())
        .ok_or_else(|| invalid("recovery destination ancestor missing"))?;
    batch.proofs.ancestors(&batch.root, parent)
}

pub(super) fn after_import(batch: &mut Batch, published: &serde_json::Value) -> io::Result<()> {
    let before = fs::read(batch.root.join(".bitmap"))?;
    let bitmap = crate::parse_jsonc(&before)?;
    if &bitmap != published {
        return Err(invalid("recovery import bitmap differs from native receipt"));
    }
    verify_unimported_rows(batch, &bitmap)?;
    let mut proofs = crate::component_tracking::observe::Observed::default();
    proofs.ancestors(&batch.root, &batch.root)?;
    proofs.read(&batch.root.join(".bitmap"))?;
    proofs.read(&crate::scope_path(&batch.root).join("index.json"))?;
    for item in &batch.items {
        for file in &item.files {
            if fs::read(&file.source)? != file.proof {
                return Err(invalid("recovery retained Source changed during import"));
            }
            proofs.read(&file.source)?;
            proofs.read(&file.path)?;
        }
    }
    batch.proofs = proofs;
    batch.bitmap = bitmap;
    let mut items = std::mem::take(&mut batch.items);
    for item in &mut items {
        item.configuration = super::configuration::prepare(batch, item)?;
    }
    batch.items = items;
    Ok(())
}
fn verify_unimported_rows(batch: &Batch, bitmap: &serde_json::Value) -> io::Result<()> {
    for (key, row) in batch.bitmap.as_object().ok_or_else(|| invalid("recovery bitmap object"))? {
        let imported = batch.items
            .iter()
            .any(|item| {
                matches!(item.action, Action::Import | Action::DeleteConfigAndImport)
                    && (item.key.as_ref() == Some(key)
                        || super::selection::key(&batch.bitmap, &item.id)
                            .ok()
                            .flatten()
                            .as_ref()
                            == Some(key))
            });
        if !imported && bitmap.get(key) != Some(row) {
            return Err(invalid("recovery import changed an unrelated bitmap row"));
        }
    }
    Ok(())
}
