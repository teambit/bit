//! Retain the preimage when second-resolution bitmap backup names collide.
use super::{History, existing, invalid, safe_destination};
use std::{fs, io, path::Path};

pub(super) fn prepare(root: &Path, file_id: Option<&str>) -> io::Result<History> {
    let file_id = file_id
        .map(str::trim)
        .filter(|id| !id.is_empty())
        .ok_or_else(|| invalid("inbound bitmap history id"))?;
    super::super::super::bitmap::validate_history_file_id(file_id)?;
    let backup = crate::scope_path(root)
        .join("bitmap-history")
        .join(format!(".bitmap-{file_id}"));
    let metadata = crate::scope_path(root).join("bitmap-history-metadata.txt");
    let attributes = Attributes::prepare(root, &backup)?;
    let backup_before = match fs::symlink_metadata(&backup) {
        Ok(_) => {
            crate::merge_state::write::validate_existing(&backup)?;
            Some(existing::current_body(root, &backup)?)
        }
        Err(error) if error.kind() == io::ErrorKind::NotFound => {
            safe_destination(root, &backup)?;
            None
        }
        Err(error) => return Err(error),
    };
    let metadata_before = match fs::symlink_metadata(&metadata) {
        Ok(info) if info.is_file() && !info.file_type().is_symlink() => Some(
            crate::read_budget::Budget::new(16 * 1024 * 1024).read(fs::File::open(&metadata)?)?,
        ),
        Ok(_) => return Err(invalid("inbound bitmap history metadata type")),
        Err(error) if error.kind() == io::ErrorKind::NotFound => None,
        Err(error) => return Err(error),
    };
    Ok(History {
        backup,
        metadata,
        metadata_before,
        backup_before,
        attributes,
        file_id: file_id.to_owned(),
        post_write_backup: false,
    })
}

#[derive(Default)]
pub(super) struct Attributes {
    pub(super) source: Option<fs::Metadata>,
    pub(super) backup: Option<fs::Metadata>,
}
impl Attributes {
    fn prepare(root: &Path, backup: &Path) -> io::Result<Self> {
        let source = fs::symlink_metadata(root.join(".bitmap"))?;
        if !source.is_file()
            || source.file_type().is_symlink()
            || cfg!(windows) && source.permissions().readonly()
        {
            return Err(invalid("unsupported inbound bitmap attributes"));
        }
        let backup = match fs::symlink_metadata(backup) {
            Ok(metadata) => Some(metadata),
            Err(error) if error.kind() == io::ErrorKind::NotFound => None,
            Err(error) => return Err(error),
        };
        Ok(Self { source: Some(source), backup })
    }
    pub(super) fn validate(&self, root: &Path, backup: &Path) -> io::Result<()> {
        if let Some(source) = &self.source {
            validate_metadata(source, &fs::symlink_metadata(root.join(".bitmap"))?)?;
        }
        if let Some(before) = &self.backup {
            validate_metadata(before, &fs::symlink_metadata(backup)?)?;
        }
        Ok(())
    }
}
fn validate_metadata(before: &fs::Metadata, after: &fs::Metadata) -> io::Result<()> {
    // Reads can legitimately update atime; it is restored/copied, not a mutation token.
    if before.permissions() != after.permissions() || before.modified()? != after.modified()? {
        return Err(invalid("inbound bitmap history attributes changed"));
    }
    Ok(())
}
