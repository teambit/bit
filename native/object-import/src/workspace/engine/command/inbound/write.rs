//! Retained workspace writes for new and clean existing components. Every
//! Source and destination is checked during Prepare; publication happens after
//! the object transaction succeeds.
pub(super) use preflight::check as preflight;

use super::{Target, invalid};
use crate::command_import::PreparedImport;
use serde_json::{Map, Value, json};
use std::{
    collections::{HashMap, HashSet},
    fs, io,
    path::{Path, PathBuf},
};

/// The component file bytes one import holds until publication.
const MAX_WRITTEN_BYTES: usize = 512 * 1024 * 1024;

pub(super) struct Prepared {
    root: PathBuf,
    bitmap_before: Vec<u8>,
    bitmap_after: Vec<u8>,
    changes: WorkspaceFiles,
    history: History,
    policy: Option<super::super::checkout_policy::Prepared>,
    policy_input: Option<Value>,
    write_deps: Option<String>,
}
#[derive(Clone, Copy)]
pub(super) struct Options<'a> {
    pub(super) override_existing: bool,
    pub(super) path: Option<&'a str>,
    pub(super) merge_strategy: Option<&'a str>,
    pub(super) track_only: bool,
    pub(super) write_to_empty_dir: bool,
    pub(super) write_deps: Option<&'a str>,
    pub(super) post_write_bitmap_history: bool,
}
#[derive(Default)]
struct WorkspaceFiles {
    additions: Vec<(PathBuf, Vec<u8>)>,
    replacements: Vec<Replacement>,
    empty_directories: Vec<PathBuf>,
    conflicts: HashMap<String, Vec<String>>,
    relocation: relocation::Retained,
    component_order: Vec<String>,
}
struct Replacement {
    path: PathBuf,
    before: Vec<u8>,
    after: Vec<u8>,
}
struct History {
    backup: PathBuf,
    metadata: PathBuf,
    metadata_before: Option<Vec<u8>>,
    backup_before: Option<Vec<u8>>,
    attributes: history::Attributes,
    file_id: String,
    post_write_backup: bool,
}

pub(super) fn prepare(
    root: &Path,
    targets: &[Target],
    import: &mut PreparedImport,
    file_id: Option<&str>,
    options: Options<'_>,
) -> io::Result<Prepared> {
    import.retain_workspace_versions(targets)?;
    let mut history = history::prepare(root, file_id)?;
    history.post_write_backup = options.post_write_bitmap_history;
    let template = directories::default_directory(root)?;
    let bitmap_before = fs::read(root.join(".bitmap"))?;
    let mut bitmap = crate::recovery::jsonc::parse(&bitmap_before)?;
    let rows = bitmap.as_object_mut().ok_or_else(|| invalid("inbound bitmap object"))?;
    let (schema, lane) = metadata::bitmap_metadata(rows)?;
    let changes = prepare_targets(root, targets, &template, import, rows, options)?;
    // `sortObjectByKeys`: `Object.keys(...).sort()`, by UTF-16 code units.
    rows.sort_keys();
    rows.insert("$schema-version".into(), schema);
    if let Some(lane) = lane {
        rows.insert("_bit_lane".into(), lane);
    }
    let bitmap_after = crate::inspection::render_bitmap(&bitmap)?;
    let policy_input =
        if options.write_deps.is_some() { None } else { policy::receipt(root, targets, import)? };
    let policy = policy_input
        .as_ref()
        .map(|receipt| super::super::checkout_policy::Prepared::new(root, receipt.clone()))
        .transpose()?;
    Ok(Prepared {
        root: root.to_owned(),
        bitmap_before,
        bitmap_after,
        changes,
        history,
        policy,
        policy_input,
        write_deps: options.write_deps.map(str::to_owned),
    })
}

/// Every target's files in its directory, bounded by [`MAX_WRITTEN_BYTES`].
fn prepare_targets(
    root: &Path,
    targets: &[Target],
    template: &str,
    import: &PreparedImport,
    rows: &mut Map<String, Value>,
    options: Options<'_>,
) -> io::Result<WorkspaceFiles> {
    let context = Planning {
        root,
        imported: import,
        override_existing: options.override_existing,
        merge_strategy: options.merge_strategy,
        track_only: options.track_only,
    };
    let mut directories = target_directories(template, targets, rows, options.path)?;
    let mut changes = WorkspaceFiles::default();
    if options.write_to_empty_dir && !options.track_only {
        changes.relocation = relocation::prepare(root, &mut directories, rows)?;
    }
    let mut directories = directories.into_iter();
    let mut written = HashSet::new();
    for target in targets {
        plan_target(&context, target, &mut directories, rows, &mut changes, &mut written)?;
    }
    let bytes = changes.additions
        .iter()
        .map(|(_, bytes)| bytes.len())
        .sum::<usize>()
        + changes.replacements
            .iter()
            .map(|replacement| replacement.after.len())
            .sum::<usize>();
    if bytes > MAX_WRITTEN_BYTES {
        return Err(invalid("inbound workspace materialization bytes"));
    }
    changes.component_order = metadata::component_order(root, rows)?;
    Ok(changes)
}

fn target_directories(
    template: &str,
    targets: &[Target],
    rows: &Map<String, Value>,
    path: Option<&str>,
) -> io::Result<Vec<String>> {
    let new = targets
        .iter()
        .filter(|target| {
            !rows
                .values()
                .any(|row| row["name"] == target.name)
        })
        .cloned()
        .collect::<Vec<_>>();
    if let Some(path) = path {
        if targets.len() != 1 || new.len() != 1 {
            return Err(invalid("inbound path requires a new component"));
        }
        crate::checkout::plan::relative_path(path)?;
        Ok(vec![path.to_owned()])
    } else {
        directories::assign(template, &new, rows)
    }
}

struct Planning<'a> {
    root: &'a Path,
    imported: &'a PreparedImport,
    override_existing: bool,
    merge_strategy: Option<&'a str>,
    track_only: bool,
}

fn plan_target(
    context: &Planning<'_>,
    target: &Target,
    directories: &mut impl Iterator<Item = String>,
    rows: &mut Map<String, Value>,
    changes: &mut WorkspaceFiles,
    written: &mut HashSet<String>,
) -> io::Result<()> {
    let existing = rows
        .values()
        .find(|row| row["name"] == target.name)
        .cloned();
    let directory = if let Some(row) = &existing {
        row["rootDir"]
            .as_str()
            .ok_or_else(|| invalid("inbound existing root directory"))?
            .to_owned()
    } else {
        directories.next().ok_or_else(|| invalid("inbound new root directory"))?
    };
    if !written.insert(directory.clone()) {
        return Err(invalid("inbound workspace destination occupied"));
    }
    if let Some(row) = existing {
        existing::prepare(
            &existing::Input {
                root: context.root,
                directory: &directory,
                target,
                imported: context.imported,
                row: &row,
                resolution: existing::Resolution {
                    override_existing: context.override_existing,
                    merge_strategy: context.merge_strategy,
                    track_only: context.track_only,
                },
            },
            rows,
            changes,
        )
    } else {
        plan_new_target(context, target, &directory, rows, changes)
    }
}

fn plan_new_target(
    context: &Planning<'_>,
    target: &Target,
    directory: &str,
    rows: &mut Map<String, Value>,
    changes: &mut WorkspaceFiles,
) -> io::Result<()> {
    if !context.track_only
        && let Some(empty) = new_directory(context.root, directory, context.override_existing)?
    {
        changes.empty_directories.push(empty);
    }
    let files = prepare_target(context.root, directory, target, context.imported, rows)?;
    if context.track_only {
        return Ok(());
    }
    new_files::prepare(context, files, changes)
}

fn prepare_target(
    root: &Path,
    directory: &str,
    target: &Target,
    import: &PreparedImport,
    rows: &mut Map<String, Value>,
) -> io::Result<Vec<(PathBuf, Vec<u8>)>> {
    let scope = target.scope.as_deref().ok_or_else(|| invalid("inbound workspace scope"))?;
    unique_name(rows, &target.name)?;
    let model = super::details::model(root, import, scope, &target.name)?;
    let (version_name, hash) = version(&model, &target.version)?;
    let version = import.overlay
        .read(&hash, "Version")?
        .ok_or_else(|| invalid("inbound imported Version"))?;
    crate::history_query::validate_version(version)?;
    let main = version["mainFile"].as_str().ok_or_else(|| invalid("inbound main file"))?;
    crate::checkout::plan::relative_path(main)?;
    let files = target_files(root, directory, version, main, import)?;
    rows.insert(
        target.name.clone(),
        json!({"name":target.name,"scope":scope,
        "version":version_name,"mainFile":main,"rootDir":directory}),
    );
    Ok(files)
}

fn new_directory(
    root: &Path,
    directory: &str,
    override_existing: bool,
) -> io::Result<Option<PathBuf>> {
    crate::checkout::plan::relative_path(directory)?;
    let path = root.join(directory);
    match fs::symlink_metadata(&path) {
        Err(error) if error.kind() == io::ErrorKind::NotFound => {
            safe_destination(root, &path)?;
            Ok(None)
        }
        Ok(metadata) if metadata.is_dir() && !metadata.file_type().is_symlink() => {
            if override_existing {
                Ok(None)
            } else if fs::read_dir(&path)?.next().is_none() {
                Ok(Some(path))
            } else {
                Err(invalid("inbound workspace destination occupied"))
            }
        }
        Ok(_) => Err(invalid("inbound workspace destination occupied or linked")),
        Err(error) => Err(error),
    }
}

/// `getWorkspacePolicyFromConfig()`: each root policy entry's version.
fn target_files(
    root: &Path,
    directory: &str,
    version: &Value,
    main: &str,
    import: &PreparedImport,
) -> io::Result<Vec<(PathBuf, Vec<u8>)>> {
    let rows = version["files"].as_array().ok_or_else(|| invalid("inbound Version files"))?;
    if rows.is_empty() || rows.len() > 4096 {
        return Err(invalid("inbound workspace files"));
    }
    let mut files = Vec::with_capacity(rows.len());
    let mut seen = HashSet::new();
    for file in rows {
        let relative = file["relativePath"].as_str().ok_or_else(|| invalid("inbound file path"))?;
        crate::checkout::plan::relative_path(relative)?;
        if !seen.insert(relative) {
            return Err(invalid("inbound duplicate file"));
        }
        let hash = file["file"].as_str().ok_or_else(|| invalid("inbound Source hash"))?;
        crate::merge_history::hash(hash)?;
        let source =
            import.overlay.source(hash).ok_or_else(|| invalid("inbound imported Source"))?;
        let path = root.join(directory).join(relative);
        files.push((path, crate::checkout::eol::auto(source.to_vec())));
    }
    if !seen.contains(main) {
        return Err(invalid("inbound main file missing"));
    }
    Ok(files)
}

fn safe_destination(root: &Path, path: &Path) -> io::Result<()> {
    let relative = path.strip_prefix(root).map_err(io::Error::other)?;
    let mut current = root.to_owned();
    for part in relative.components() {
        current.push(part);
        match fs::symlink_metadata(&current) {
            Ok(metadata) if current != path && metadata.is_dir() => {}
            Ok(_) => return Err(invalid("inbound workspace destination occupied or linked")),
            Err(error) if error.kind() == io::ErrorKind::NotFound => {}
            Err(error) => return Err(error),
        }
    }
    Ok(())
}

fn unique_name(rows: &Map<String, Value>, name: &str) -> io::Result<()> {
    if rows.contains_key(name)
        || rows
            .values()
            .any(|row| row["name"] == name)
    {
        return Err(invalid("inbound existing workspace component requires canonical writer"));
    }
    Ok(())
}

pub(super) fn version(model: &Value, requested: &str) -> io::Result<(String, String)> {
    let hash = if requested == "latest" {
        model["head"].as_str()
    } else if crate::merge_history::hash(requested).is_ok() {
        Some(requested)
    } else {
        model["versions"][requested]
            .as_str()
            .or_else(|| model["orphanedVersions"][requested].as_str())
    }
    .ok_or_else(|| invalid("inbound requested version"))?;
    crate::merge_history::hash(hash)?;
    let name = model["versions"]
        .as_object()
        .and_then(|versions| {
            versions
                .iter()
                .rev()
                .find(|(_, value)| value.as_str() == Some(hash))
        })
        .map_or_else(|| hash.to_owned(), |(tag, _)| tag.clone());
    Ok((name, hash.to_owned()))
}

mod directories;
mod existing;
mod history;
mod metadata;
mod new_files;
mod policy;
mod preflight;
mod publication;
mod relocation;

#[cfg(test)]
mod tests;
