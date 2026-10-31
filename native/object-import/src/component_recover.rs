//! Restore a locally soft-deleted component from verified scope Sources and its main or lane head.

pub(crate) mod probe;

pub use batch::{Action, Batch};
pub use probe::probe_remote;

mod batch;

use crate::{
    checkout::repository,
    component_remove::{Lane, RowKind, backup_bitmap, select, validate_file_id},
    inspection, merge_history, recovery,
    workspace::engine::command::outbound,
};
use serde_json::Value;
use std::{
    collections::HashSet,
    fs, io,
    path::{Path, PathBuf},
};

const MAX_FILES: usize = 4096;
const MAX_BYTES: usize = 32 * 1024 * 1024;

pub struct Plan {
    root: PathBuf,
    bitmap: Bitmap,
    repository: Repository,
    directory: PathBuf,
    files: Vec<SourceFile>,
    full_id: String,
    restore_files: bool,
}
struct Bitmap {
    before: Vec<u8>,
    after: Vec<u8>,
}
struct Repository {
    index: Vec<u8>,
    objects: Vec<Object>,
    sources: Vec<Object>,
}
struct Object {
    path: PathBuf,
    before: Vec<u8>,
}
struct SourceFile {
    path: PathBuf,
    bytes: Vec<u8>,
}
struct Selection {
    key: String,
    identity: String,
    version: String,
    directory: PathBuf,
    main_file: PathBuf,
    restore_files: bool,
    lane: Option<Lane>,
}
impl Plan {
    pub fn prepare(root: &Path, name: &str) -> io::Result<Self> {
        let before = fs::read(root.join(".bitmap"))?;
        let mut bitmap = recovery::jsonc::parse(&before)?;
        let selected = select_component(root, &bitmap, name)?;
        let (repository, files) = prepare_files(root, &selected)?;
        bitmap[&selected.key]
            .as_object_mut()
            .ok_or_else(|| invalid("bitmap row"))?
            .remove("config");
        let after = inspection::render_workspace_bitmap(&bitmap)?;
        Ok(Self {
            root: root.to_owned(),
            bitmap: Bitmap { before, after },
            repository,
            directory: selected.directory,
            files,
            full_id: format!("{}@{}", selected.identity, selected.version),
            restore_files: selected.restore_files,
        })
    }
    #[must_use]
    pub fn full_id(&self) -> &str {
        &self.full_id
    }
    pub fn commit(&self, file_id: &str) -> io::Result<()> {
        self.validate(file_id)?;
        if self.restore_files {
            fs::create_dir_all(&self.directory)?;
            for file in &self.files {
                if let Some(parent) = file.path.parent() {
                    fs::create_dir_all(parent)?;
                }
                fs::write(&file.path, &file.bytes)?;
            }
        }
        backup_bitmap(&self.root, file_id, "recover")?;
        fs::write(self.root.join(".bitmap"), &self.bitmap.after)
    }
    fn validate(&self, file_id: &str) -> io::Result<()> {
        validate_file_id(file_id)?;
        if fs::read(self.root.join(".bitmap"))? != self.bitmap.before
            || fs::read(crate::scope_path(&self.root).join("index.json"))?
                != self.repository.index
        {
            return Err(invalid("component workspace changed before recovery"));
        }
        for object in &self.repository.objects {
            if fs::read(&object.path)? != object.before {
                return Err(invalid("component object changed before recovery"));
            }
        }
        for source in &self.repository.sources {
            if fs::read(&source.path)? != source.before {
                return Err(invalid("component Source changed before recovery"));
            }
        }
        validate_destination(&self.root, &self.directory, self.restore_files)?;
        if !self.restore_files && !sources_match(&self.files) {
            return Err(invalid("component sources changed before recovery"));
        }
        Ok(())
    }
}

fn sources_match(files: &[SourceFile]) -> bool {
    files
        .iter()
        .all(|file| fs::read(&file.path).ok().as_deref() == Some(file.bytes.as_slice()))
}

fn deletion_mode(row: &Value) -> io::Result<bool> {
    let config = row["config"].as_object().ok_or_else(|| invalid("component delete config"))?;
    if config.len() != 1 {
        return Err(invalid("component delete config"));
    }
    let remove = config
        .get("teambit.component/remove")
        .or_else(|| {
            config
                .iter()
                .find_map(|(key, value)| {
                    key.starts_with("teambit.component/remove@").then_some(value)
                })
        })
        .and_then(Value::as_object)
        .ok_or_else(|| invalid("component delete config"))?;
    match (remove.get("removed"), remove.get("range"), remove.get("snaps"), remove.len()) {
        (Some(Value::Bool(true)), None, None, 1) => Ok(true),
        (Some(Value::Bool(false)), Some(Value::String(_)), None, 2)
        | (Some(Value::Bool(false)), None, Some(Value::Array(_)), 2) => Ok(false),
        _ => Err(invalid("component is not locally soft-deleted")),
    }
}

fn select_component(root: &Path, bitmap: &Value, name: &str) -> io::Result<Selection> {
    let key = tracked_key(bitmap, name)?;
    let row = &bitmap[&key];
    let restore_files = deletion_mode(row)?;
    let mut selectable = bitmap.clone();
    selectable[&key]
        .as_object_mut()
        .ok_or_else(|| invalid("bitmap row"))?
        .remove("config");
    let selected = select(root, &selectable, name, true, RowKind::Staged)
        .or_else(|_| select(root, &selectable, name, true, RowKind::Imported))
        .or_else(|_| select(root, &selectable, name, true, RowKind::ExportedLane))?;
    if selected.main_exists == restore_files {
        return Err(invalid("component source state is outside local recovery"));
    }
    let relative = row["rootDir"]
        .as_str()
        .map(str::trim)
        .filter(|dir| !dir.is_empty())
        .ok_or_else(|| invalid("component root"))?;
    crate::checkout::plan::relative_path(relative)?;
    if relative == "." {
        return Err(invalid("component workspace root"));
    }
    let directory = root.join(relative);
    validate_destination(root, &directory, restore_files)?;
    let version = selected.version.ok_or_else(|| invalid("component version"))?;
    let main_file = component_main_file(&directory, row)?;
    Ok(Selection {
        key,
        identity: selected.identity,
        version,
        directory,
        main_file,
        restore_files,
        lane: selected.lane,
    })
}
fn component_main_file(directory: &Path, row: &Value) -> io::Result<PathBuf> {
    Ok(directory.join(
        row["mainFile"]
            .as_str()
            .map(str::trim)
            .filter(|file| !file.is_empty())
            .ok_or_else(|| invalid("component main file"))?,
    ))
}
fn prepare_files(root: &Path, selected: &Selection) -> io::Result<(Repository, Vec<SourceFile>)> {
    let (mut repository, manifest) = read_repository(root, selected)?;
    let (files, sources) = source_files(root, &selected.directory, &manifest)?;
    repository.sources = sources;
    if !files
        .iter()
        .any(|file| file.path == selected.main_file)
    {
        return Err(invalid("component main file is not in the stored Version"));
    }
    if !selected.restore_files && !sources_match(&files) {
        return Err(invalid("component sources differ from the stored Version"));
    }
    Ok((repository, files))
}

fn tracked_key(bitmap: &Value, name: &str) -> io::Result<String> {
    let target = name
        .trim()
        .split('@')
        .next()
        .unwrap_or(name)
        .trim();
    let rows = bitmap.as_object().ok_or_else(|| invalid("component bitmap"))?;
    let matches: Vec<_> = rows
        .iter()
        .filter(|(key, row)| {
            !key.starts_with('$')
                && !matches!(key.as_str(), "_bit_lane" | "version")
                && row.is_object()
                && {
                    let (scope, bare_name) = crate::reset_lane::bitmap::row_identity(key, row);
                    bare_name == target
                        || scope.is_some_and(|scope| format!("{scope}/{bare_name}") == target)
                }
        })
        .collect();
    if matches.len() != 1 {
        return Err(invalid("component is not uniquely tracked"));
    }
    Ok(matches[0].0.clone())
}
fn read_repository(root: &Path, selected: &Selection) -> io::Result<(Repository, Value)> {
    let (scope, name) =
        selected.identity.split_once('/').ok_or_else(|| invalid("component identity"))?;
    let (index, model, model_value) = read_model(root, scope, name)?;
    let version_hash = if selected.lane.is_some() {
        selected.version.as_str()
    } else if matches!(selected.version.as_str(), "latest" | "head") {
        model_value["head"].as_str().ok_or_else(|| invalid("component version is not in model"))?
    } else {
        model_value["versions"][&selected.version]
            .as_str()
            .or_else(|| model_value["orphanedVersions"][&selected.version].as_str())
            .or_else(|| {
                (model_value["head"] == selected.version).then_some(selected.version.as_str())
            })
            .ok_or_else(|| invalid("component version is not in model"))?
    };
    let version_object = frozen(root, version_hash)?;
    let objects_dir = crate::scope_path(root).join("objects");
    let manifest = outbound::read_object(&objects_dir, version_hash, "Version")?;
    let mut objects = vec![model, version_object];
    if let Some(lane) = &selected.lane {
        let object = frozen(root, &lane.hash)?;
        if object.before != lane.before || index != lane.index_before {
            return Err(invalid("current lane changed during recovery"));
        }
        objects.push(object);
    }
    Ok((Repository { index, objects, sources: Vec::new() }, manifest))
}
fn matches_index_row(row: &Value, scope: &str, name: &str) -> bool {
    let (row_scope, row_name) =
        crate::workspace::engine::command::inbound::remote::file_list::row_id_parts(row)
            .map_or(("", ""), |(sc, nm)| (sc.unwrap_or_default(), nm));
    row["isSymlink"] != true && row_name == name && (row_scope == scope || row_scope.is_empty())
}
fn read_model(root: &Path, scope: &str, name: &str) -> io::Result<(Vec<u8>, Object, Value)> {
    let index = fs::read(crate::scope_path(root).join("index.json"))?;
    let value: Value = crate::parse_jsonc(&index)?;
    let rows = value["components"]
        .as_array()
        .or_else(|| value.as_array())
        .ok_or_else(|| invalid("scope index"))?;
    let matches: Vec<_> = rows
        .iter()
        .filter(|row| matches_index_row(row, scope, name))
        .collect();
    if matches.len() != 1 {
        return Err(invalid("component is not uniquely indexed"));
    }
    let model_hash = matches[0]["hash"].as_str().ok_or_else(|| invalid("Component hash"))?;
    let model = frozen(root, model_hash)?;
    let model_value =
        outbound::read_object(&crate::scope_path(root).join("objects"), model_hash, "Component")?;
    let model_scope = model_value["scope"].as_str().unwrap_or_default();
    if (!model_scope.is_empty() && model_scope != scope) || model_value["name"] != name {
        return Err(invalid("Component model identity"));
    }
    Ok((index, model, model_value))
}
fn source_files(
    root: &Path,
    directory: &Path,
    version: &Value,
) -> io::Result<(Vec<SourceFile>, Vec<Object>)> {
    let manifest = version["files"].as_array().ok_or_else(|| invalid("Version files"))?;
    if manifest.is_empty() || manifest.len() > MAX_FILES {
        return Err(invalid("Version file count"));
    }
    let objects_dir = crate::scope_path(root).join("objects");
    let mut seen = HashSet::new();
    let mut files = Vec::with_capacity(manifest.len());
    let mut sources = Vec::with_capacity(manifest.len());
    let mut total = 0;
    for item in manifest {
        let relative = item["relativePath"].as_str().ok_or_else(|| invalid("Version file path"))?;
        crate::checkout::plan::relative_path(relative)?;
        if relative == ".bitmap" || !seen.insert(relative) {
            return Err(invalid("Version file path"));
        }
        let hash = item["file"].as_str().ok_or_else(|| invalid("Version Source"))?;
        sources.push(frozen(root, hash)?);
        let mut compressed = 0;
        let bytes = repository::source(
            &objects_dir,
            merge_history::hash(hash)?,
            MAX_BYTES - total,
            &mut compressed,
        )?;
        total += bytes.len();
        files.push(SourceFile { path: directory.join(relative), bytes });
    }
    Ok((files, sources))
}
fn frozen(root: &Path, hash: &str) -> io::Result<Object> {
    merge_history::hash(hash)?;
    let path = crate::scope_path(root)
        .join("objects")
        .join(&hash[..2])
        .join(&hash[2..]);
    let kind = fs::symlink_metadata(&path)?.file_type();
    if !kind.is_file() || kind.is_symlink() || fs::metadata(&path)?.len() > MAX_BYTES as u64 {
        return Err(invalid("component object path"));
    }
    Ok(Object { before: fs::read(&path)?, path })
}
fn validate_destination(root: &Path, directory: &Path, vacant: bool) -> io::Result<()> {
    let relative = directory.strip_prefix(root).map_err(io::Error::other)?;
    let mut path = root.to_owned();
    for component in relative.components() {
        path.push(component);
        match fs::symlink_metadata(&path) {
            Ok(metadata)
                if (path != directory || !vacant)
                    && metadata.is_dir()
                    && !metadata.file_type().is_symlink() => {}
            Err(error) if error.kind() == io::ErrorKind::NotFound => {}
            _ => return Err(invalid("component recovery destination exists or is unsafe")),
        }
    }
    Ok(())
}
fn invalid(message: &str) -> io::Error {
    io::Error::new(io::ErrorKind::InvalidInput, message)
}
