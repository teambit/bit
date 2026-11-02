//! `last-merged` [`Prepared`] backup inspection via [`main`], [`paths`], and [`projection`].

mod main;
mod paths;
mod projection;
#[cfg(test)]
mod tests;

use super::{
    super::{invalid, proof},
    Operation,
};
use std::{
    io,
    path::{Path, PathBuf},
};

/// Prepared `last-merged` backup bytes, file mutations, and object restorations for recovery.
pub(super) struct Prepared {
    pub(super) bitmap: Vec<u8>,
    pub(super) staged_snaps: Option<Vec<u8>>,
    pub(super) workspace: Vec<u8>,
    pub(super) items: Vec<String>,
    root: PathBuf,
    mutations: Mutations,
    lane: bool,
    objects: Objects,
}
/// Optional lane and main-component object restoration states for `last-merged` recovery.
#[derive(Default)]
struct Objects {
    lane: Option<super::lane::Lane>,
    main: Option<main::Main>,
}
#[derive(Default)]
struct Mutations {
    copies: Vec<(PathBuf, PathBuf)>,
    removals: Vec<PathBuf>,
    staged: Vec<(Option<PathBuf>, PathBuf)>,
    permissions: Vec<(PathBuf, std::fs::Permissions)>,
    staged_bytes: Vec<Option<Vec<u8>>>,
}
#[inline]
pub(super) fn prepare(
    root: &Path,
    operation: Operation,
    proofs: &mut Vec<proof::Proof>,
) -> io::Result<Prepared> {
    let lane = operation == Operation::LaneAbort;
    let backup = crate::scope_path(root).join("last-merged");
    let bitmap_path = if lane { backup.join("bitmap") } else { root.join(".bitmap") };
    let workspace_path =
        if lane { backup.join("workspace.jsonc") } else { root.join("workspace.jsonc") };
    let bitmap =
        proof::read(&bitmap_path, proofs)?.ok_or_else(|| invalid("recovery bitmap backup absent"))?;
    let workspace = proof::read(&workspace_path, proofs)?
        .ok_or_else(|| invalid("recovery workspace backup absent"))?;
    let mut prepared = Prepared {
        bitmap,
        staged_snaps: None,
        workspace,
        items: Vec::new(),
        root: root.into(),
        mutations: Mutations::default(),
        lane,
        objects: Objects::default(),
    };
    if lane {
        prepare_lane(&mut prepared, &bitmap_path, &workspace_path, proofs)?;
    }
    if let Some(object) = &prepared.objects.lane {
        prepared.items.push(format!("{} lane object", object.id));
    }
    prepared.capture_permissions()?;
    prepared.validate()?;
    Ok(prepared)
}
fn prepare_lane(
    prepared: &mut Prepared,
    bitmap_path: &Path,
    workspace_path: &Path,
    proofs: &mut Vec<proof::Proof>,
) -> io::Result<()> {
    let root = &prepared.root;
    let current = crate::recovery::jsonc::parse(
        &proof::read(&root.join(".bitmap"), proofs)?
            .ok_or_else(|| invalid("recovery live bitmap"))?,
    )?;
    prepared.objects.lane = super::lane::prepare(root, &current, proofs)?;
    if prepared.objects.lane.is_none() {
        prepared.objects.main = main::Main::prepare(root, proofs)?;
    }
    prepared.mutations.removals =
        paths::removals(root, &current, bitmap_path, &prepared.bitmap, proofs)?;
    prepared.mutations.copies.extend([
        (bitmap_path.to_path_buf(), root.join(".bitmap")),
        (workspace_path.to_path_buf(), root.join("workspace.jsonc")),
    ]);
    report_items(prepared);
    staged_controls(prepared, proofs)?;
    Ok(())
}
fn report_items(prepared: &mut Prepared) {
    let root = &prepared.root;
    prepared.items = vec![".bitmap file".into(), "workspace.jsonc file".into()];
    if !prepared.mutations.removals.is_empty() {
        prepared.items.push(format!(
            "deleted components directories: {}",
            prepared.mutations.removals
                .iter()
                .map(|path| {
                    path.strip_prefix(root)
                        .unwrap_or(path)
                        .to_string_lossy()
                })
                .collect::<Vec<_>>()
                .join(", "),
        ));
    }
}
fn staged_controls(prepared: &mut Prepared, proofs: &mut Vec<proof::Proof>) -> io::Result<()> {
    let root = &prepared.root;
    let scope_dir = crate::scope_path(root);
    let backup = scope_dir.join("last-merged");
    let lane_id = prepared.objects.lane
        .as_ref()
        .map(|lane| lane.id.trim().trim_matches('/'))
        .filter(|id| !id.is_empty())
        .unwrap_or("main");
    crate::checkout::plan::relative_path(lane_id)?;
    let staged_config = format!("staged-config/{lane_id}.json");
    let staged_snaps_path = scope_dir.join("staged-snaps");
    for (source, destination) in
        [("staged-snaps", "staged-snaps"), ("staged-config.json", staged_config.as_str())]
    {
        let source = backup.join(source);
        let destination = scope_dir.join(destination);
        paths::staged(&prepared.root, &destination, proofs)?;
        proof::read(&destination, proofs)?;
        let bytes = proof::read(&source, proofs)?;
        if destination == staged_snaps_path {
            prepared.staged_snaps.clone_from(&bytes);
        }
        prepared.mutations.staged_bytes.push(bytes.clone());
        let source = bytes.map(|_| source);
        prepared.mutations.staged.push((source, destination));
    }
    Ok(())
}
impl Prepared {
    fn capture_permissions(&mut self) -> io::Result<()> {
        for source in self.mutations.copies
            .iter()
            .map(|row| &row.0)
            .chain(self.mutations.staged.iter().filter_map(|row| row.0.as_ref()))
        {
            self.mutations.permissions.push((
                source.clone(),
                std::fs::metadata(source)?.permissions(),
            ));
        }
        Ok(())
    }

    #[inline]
    fn validate_permissions(&self) -> io::Result<()> {
        for (source, permissions) in &self.mutations.permissions {
            if std::fs::metadata(source)?.permissions() != *permissions {
                return Err(invalid("recovery backup permissions changed"));
            }
        }
        Ok(())
    }
    pub(super) fn validate(&self) -> io::Result<()> {
        self.validate_permissions()?;

        if let Some(object) = &self.objects.lane {
            object.validate()?;
        }
        if let Some(main) = &self.objects.main {
            main.validate()?;
        }
        for (source, destination) in &self.mutations.copies {
            crate::recovery::validate_copy(source, destination)?;
        }
        for (source, destination) in &self.mutations.staged {
            paths::staged(&self.root, destination, &mut Vec::new())?;
            if let Some(source) = source {
                crate::recovery::validate_copy(source, destination)?;
            }
        }
        for path in &self.mutations.removals {
            if let Ok(meta) = std::fs::symlink_metadata(path)
                && meta.file_type().is_symlink()
            {
                return Err(invalid("recovery removal symlink"));
            }
        }
        Ok(())
    }
    #[inline]
    pub(in super::super) fn main_objects(&self) -> &[(String, Vec<u8>)] {
        self.objects.main
            .as_ref()
            .map_or(&[], |main| main.objects.as_slice())
    }
    pub(super) fn publish(&mut self) -> io::Result<()> {
        if let Some(main) = &self.objects.main {
            main.publish(&self.root)?;
        }
        if let Some(object) = &mut self.objects.lane {
            object.publish(&self.root)?;
        }
        for path in &self.mutations.removals {
            crate::workspace::actions::remove(path)?;
        }
        for (source, destination) in &self.mutations.copies {
            crate::recovery::copy_file(source, destination)?;
        }
        for (source, destination) in &self.mutations.staged {
            match source {
                Some(source) => crate::recovery::copy_file(source, destination)?,
                None => crate::workspace::actions::remove(destination)?,
            }
        }
        if self.lane {
            crate::workspace::actions::remove(&crate::scope_path(&self.root).join("last-merged"))?;
        }
        Ok(())
    }
}
