//! Retained workspace writes for new and clean existing components. Every
//! Source and destination is checked during Prepare; publication happens after
//! the object transaction succeeds.
use super::{Target, config, invalid};
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
}
#[derive(Clone, Copy)]
pub(super) struct Options<'a> {
    pub(super) override_existing: bool,
    pub(super) path: Option<&'a str>,
    pub(super) install_requested: bool,
    pub(super) merge_strategy: Option<&'a str>,
}
#[derive(Default)]
struct WorkspaceFiles {
    additions: Vec<(PathBuf, Vec<u8>)>,
    replacements: Vec<Replacement>,
    empty_directories: Vec<PathBuf>,
    conflicts: HashMap<String, Vec<String>>,
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
    file_id: String,
}

pub(super) fn prepare(
    root: &Path,
    targets: &[Target],
    import: &PreparedImport,
    file_id: Option<&str>,
    options: Options<'_>,
) -> io::Result<Prepared> {
    let history = prepare_history(root, file_id)?;
    let template = default_directory(root)?;
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
    Ok(Prepared { root: root.to_owned(), bitmap_before, bitmap_after, changes, history })
}

impl Prepared {
    pub(super) fn conflicts(&self, id: &str) -> Option<&[String]> {
        self.changes.conflicts.get(id).map(Vec::as_slice)
    }
}

fn default_directory(root: &Path) -> io::Result<String> {
    config::configuration(root)?["defaultDirectory"]
        .as_str()
        .map(str::to_owned)
        .ok_or_else(|| invalid("inbound workspace default directory"))
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
    let policy = policy::workspace_policy(root)?;
    let context = Planning {
        root,
        imported: import,
        policy: &policy,
        override_existing: options.override_existing,
        install_requested: options.install_requested,
        merge_strategy: options.merge_strategy,
    };
    let mut directories = target_directories(template, targets, rows, options.path)?.into_iter();
    let mut changes = WorkspaceFiles::default();
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
    policy: &'a HashMap<String, String>,
    override_existing: bool,
    install_requested: bool,
    merge_strategy: Option<&'a str>,
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
                policy: context.policy,
                resolution: existing::Resolution {
                    override_existing: context.override_existing,
                    install_requested: context.install_requested,
                    merge_strategy: context.merge_strategy,
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
    if let Some(empty) = new_directory(context.root, directory, context.override_existing)? {
        changes.empty_directories.push(empty);
    }
    let files =
        prepare_target(context.root, directory, target, context.imported, rows, context.policy)?;
    for (path, after) in files {
        match fs::symlink_metadata(&path) {
            Err(error) if error.kind() == io::ErrorKind::NotFound => {
                safe_destination(context.root, &path)?;
                changes.additions.push((path, after));
            }
            Ok(_) if context.override_existing => {
                let before = existing::current_body(context.root, &path)?;
                if before != after {
                    changes.replacements.push(Replacement { path, before, after });
                }
            }
            Ok(_) => return Err(invalid("inbound workspace destination occupied")),
            Err(error) => return Err(error),
        }
    }
    Ok(())
}

fn prepare_history(root: &Path, file_id: Option<&str>) -> io::Result<History> {
    let file_id = file_id.ok_or_else(|| invalid("inbound bitmap history id"))?;
    super::super::bitmap::validate_history_file_id(file_id)?;
    let backup = root
        .join(".bit/bitmap-history")
        .join(format!(".bitmap-{file_id}"));
    let metadata = root.join(".bit/bitmap-history-metadata.txt");
    safe_destination(root, &backup)?;
    let metadata_before = match fs::read(&metadata) {
        Ok(bytes) => Some(bytes),
        Err(error) if error.kind() == io::ErrorKind::NotFound => None,
        Err(error) => return Err(error),
    };
    if metadata_before.is_some() && !fs::symlink_metadata(&metadata)?.is_file() {
        return Err(invalid("inbound bitmap history metadata type"));
    }
    Ok(History { backup, metadata, metadata_before, file_id: file_id.to_owned() })
}

fn prepare_target(
    root: &Path,
    directory: &str,
    target: &Target,
    import: &PreparedImport,
    rows: &mut Map<String, Value>,
    policy: &HashMap<String, String>,
) -> io::Result<Vec<(PathBuf, Vec<u8>)>> {
    let scope = target.scope.as_deref().ok_or_else(|| invalid("inbound workspace scope"))?;
    unique_name(rows, &target.name)?;
    let model = import.overlay
        .models()
        .into_iter()
        .find(|model| model["scope"] == scope && model["name"] == target.name)
        .ok_or_else(|| invalid("inbound imported model"))?;
    let (version_name, hash) = version(model, &target.version)?;
    let version = import.overlay
        .read(&hash, "Version")?
        .ok_or_else(|| invalid("inbound imported Version"))?;
    crate::history_query::validate_version(version)?;
    policy::reject_update(version, policy)?;
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
mod metadata;
mod policy;
mod publication;

#[cfg(test)]
mod tests;
