//! Untrack a workspace component with the bitmap and file lifecycle of
//! local `bit remove`.

pub(crate) use lane::Lane;
pub use versioned::VersionedPlan;

mod lane;
mod row;
mod versioned;

use crate::{inspection, recovery};
use lane::select_lane;
use row::supported_row;
use serde_json::Value;
use std::{
    fs, io,
    path::{Component, Path, PathBuf},
};

pub struct Plan {
    root: PathBuf,
    bitmap: BitmapChange,
    files: Option<PathBuf>,
    package: PathBuf,
    identity: String,
    main_exists: bool,
    version: Option<String>,
    lane: Option<Lane>,
}

struct BitmapChange {
    before: Vec<u8>,
    after: Vec<u8>,
}

#[derive(Clone, Copy, PartialEq, Eq)]
pub(crate) enum RowKind {
    New,
    Staged,
    Imported,
    LaneSnap,
    ExportedLane,
}

impl Plan {
    pub fn prepare(root: &Path, name: &str, keep_files: bool) -> io::Result<Self> {
        Self::prepare_with(root, name, keep_files, RowKind::New)
    }

    fn prepare_with(root: &Path, name: &str, keep_files: bool, kind: RowKind) -> io::Result<Self> {
        let bitmap_before = fs::read(root.join(".bitmap"))?;
        let mut bitmap = recovery::jsonc::parse(&bitmap_before)?;
        let selected = select(root, &bitmap, name, keep_files, kind)?;
        let rows = bitmap.as_object_mut().ok_or_else(|| invalid("component bitmap"))?;
        rows.shift_remove(&selected.key);
        let bitmap_after = inspection::render_bitmap(&bitmap)?;
        Ok(Self {
            root: root.to_owned(),
            bitmap: BitmapChange { before: bitmap_before, after: bitmap_after },
            files: selected.files,
            package: selected.package,
            identity: selected.identity,
            main_exists: selected.main_exists,
            version: selected.version,
            lane: selected.lane,
        })
    }

    #[must_use]
    pub fn identity(&self) -> &str {
        &self.identity
    }

    #[must_use]
    pub fn main_exists(&self) -> bool {
        self.main_exists
    }

    pub fn commit(&self, file_id: &str) -> io::Result<()> {
        self.validate_before_commit(file_id)?;
        self.apply(file_id)
    }

    fn validate_before_commit(&self, file_id: &str) -> io::Result<()> {
        if fs::read(self.root.join(".bitmap"))? != self.bitmap.before {
            return Err(invalid("component bitmap changed before removal"));
        }
        if let Some(lane) = &self.lane
            && fs::read(&lane.path)? != lane.before
        {
            return Err(invalid("current lane changed before removal"));
        }
        validate_file_id(file_id)?;
        if let Some(path) = &self.files {
            validate_directory(path)?;
        }
        if self.package.try_exists()? {
            validate_directory(&self.package)?;
        }
        Ok(())
    }

    fn apply(&self, file_id: &str) -> io::Result<()> {
        if let Some(path) = &self.files {
            fs::remove_dir_all(path)?;
        }
        if self.package.try_exists()? {
            fs::remove_dir_all(&self.package)?;
        }
        backup_bitmap(&self.root, file_id, "remove")?;
        fs::write(self.root.join(".bitmap"), &self.bitmap.after)
    }
}

pub(crate) struct Selected {
    pub(crate) key: String,
    pub(crate) identity: String,
    pub(crate) files: Option<PathBuf>,
    pub(crate) package: PathBuf,
    pub(crate) main_exists: bool,
    pub(crate) version: Option<String>,
    pub(crate) lane: Option<Lane>,
}

pub(crate) fn select(
    root: &Path,
    bitmap: &Value,
    name: &str,
    keep_files: bool,
    kind: RowKind,
) -> io::Result<Selected> {
    let (key, row) = find_row(bitmap, name, kind)?;
    let (component_name, scope) = supported_row(key, row, kind)?;
    let lane = if bitmap["_bit_lane"].is_null() {
        if matches!(kind, RowKind::LaneSnap | RowKind::ExportedLane) {
            return Err(invalid("component is not on a lane"));
        }
        None
    } else {
        if !matches!(kind, RowKind::New | RowKind::LaneSnap | RowKind::ExportedLane) {
            return Err(invalid("component removal on a lane"));
        }
        Some(select_lane(root, bitmap, scope, component_name, row, kind)?)
    };
    let version = (kind != RowKind::New).then(|| {
        row["version"]
            .as_str()
            .unwrap_or_default()
            .to_owned()
    });
    let identity = format!("{scope}/{component_name}");
    validate_workspace_config(root, &identity)?;
    if kind == RowKind::New {
        validate_no_model(root, scope, component_name)?;
    }
    let (main_exists, files) = component_files(root, bitmap, key, row, keep_files)?;
    let package = package(root, scope, component_name)?;
    if package.try_exists()? {
        validate_directory(&package)?;
    }
    Ok(Selected { key: key.clone(), identity, files, package, main_exists, version, lane })
}

fn find_row<'a>(
    bitmap: &'a Value,
    name: &str,
    kind: RowKind,
) -> io::Result<(&'a String, &'a Value)> {
    bitmap
        .as_object()
        .ok_or_else(|| invalid("component bitmap"))?
        .iter()
        .find(|(key, row)| {
            *key == name
                || (matches!(kind, RowKind::Imported | RowKind::ExportedLane)
                    && name
                        .split_once('/')
                        .is_some_and(|(scope, component)| {
                            *key == component && row["scope"] == scope
                        }))
        })
        .ok_or_else(|| invalid("component not tracked"))
}

fn component_files(
    root: &Path,
    bitmap: &Value,
    key: &str,
    row: &Value,
    keep_files: bool,
) -> io::Result<(bool, Option<PathBuf>)> {
    let root_dir = row["rootDir"].as_str().ok_or_else(|| invalid("component root"))?;
    let main_file = row["mainFile"].as_str().ok_or_else(|| invalid("component main file"))?;
    if !safe_relative(Path::new(main_file)) {
        return Err(invalid("component main file"));
    }
    let main_exists = root
        .join(root_dir)
        .join(main_file)
        .is_file();
    let rows = bitmap.as_object().ok_or_else(|| invalid("component bitmap"))?;
    Ok((main_exists, files(root, rows, key, root_dir, keep_files)?))
}

fn validate_workspace_config(root: &Path, identity: &str) -> io::Result<()> {
    let path = root.join("workspace.jsonc");
    if path.try_exists()? && fs::read_to_string(path)?.contains(identity) {
        return Err(invalid("component has workspace configuration"));
    }
    Ok(())
}

fn validate_no_model(root: &Path, scope: &str, name: &str) -> io::Result<()> {
    let path = root.join(".bit/index.json");
    if !path.try_exists()? {
        return Ok(());
    }
    let index: Value = serde_json::from_slice(&fs::read(path)?)?;
    let Some(rows) = index["components"].as_array() else { return Err(invalid("component index")) };
    if rows
        .iter()
        .any(|component| component["id"]["scope"] == scope && component["id"]["name"] == name)
    {
        return Err(invalid("component already has a local model"));
    }
    Ok(())
}

fn files(
    root: &Path,
    rows: &serde_json::Map<String, Value>,
    key: &str,
    directory: &str,
    keep: bool,
) -> io::Result<Option<PathBuf>> {
    let relative = Path::new(directory);
    validate_component_root(relative)?;
    validate_no_overlap(rows, key, relative)?;
    if keep {
        return Ok(None);
    }
    let path = root.join(relative);
    validate_ancestors(root, relative)?;
    validate_directory(&path)?;
    Ok(Some(path))
}

fn validate_component_root(relative: &Path) -> io::Result<()> {
    if relative == Path::new(".") {
        return Err(invalid("workspace root component"));
    }
    if !safe_relative(relative)
        || relative
            .components()
            .next()
            .is_some_and(|part| {
                matches!(part.as_os_str().to_str(), Some(".bit" | ".git" | "node_modules"))
            })
    {
        return Err(invalid("component root is outside the workspace"));
    }
    Ok(())
}

fn validate_no_overlap(
    rows: &serde_json::Map<String, Value>,
    key: &str,
    relative: &Path,
) -> io::Result<()> {
    for (other_key, other) in rows {
        if other_key == key || other_key.starts_with('$') || other_key == "_bit_lane" {
            continue;
        }
        let Some(other) = other["rootDir"].as_str() else {
            return Err(invalid("another component has no root"));
        };
        let other = Path::new(other);
        if !safe_relative(other) || other.starts_with(relative) || relative.starts_with(other) {
            return Err(invalid("component root overlaps another component"));
        }
    }
    Ok(())
}

fn package(root: &Path, scope: &str, name: &str) -> io::Result<PathBuf> {
    let (owner, rest) = scope
        .split_once('.')
        .map_or((scope, ""), |(owner, rest)| (owner, rest));
    let filename = if rest.is_empty() {
        name.replace('/', ".")
    } else {
        format!("{}.{}", rest, name.replace('/', "."))
    };
    let package = root
        .join("node_modules")
        .join(format!("@{owner}"))
        .join(filename);
    if !package.starts_with(root.join("node_modules")) {
        return Err(invalid("component package path"));
    }
    validate_ancestors(
        root,
        package.strip_prefix(root).map_err(|_| invalid("component package path"))?,
    )?;
    Ok(package)
}

fn validate_ancestors(root: &Path, relative: &Path) -> io::Result<()> {
    let mut path = root.to_owned();
    for part in relative.components() {
        if !matches!(part, Component::Normal(_)) {
            return Err(invalid("component path is outside the workspace"));
        }
        path.push(part);
        match fs::symlink_metadata(&path) {
            Ok(metadata) if metadata.file_type().is_dir() && !metadata.file_type().is_symlink() => {
            }
            Ok(_) => return Err(invalid("component path is not a directory")),
            Err(error) if error.kind() == io::ErrorKind::NotFound => {}
            Err(error) => return Err(error),
        }
    }
    Ok(())
}

fn safe_relative(path: &Path) -> bool {
    !path.as_os_str().is_empty()
        && path
            .components()
            .all(|component| matches!(component, Component::Normal(_)))
}

fn valid_name(name: &str) -> bool {
    !name.is_empty()
        && name
            .split('/')
            .all(|part| {
                !part.is_empty()
                    && part
                        .bytes()
                        .all(|byte| {
                            byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'-' | b'_')
                        })
            })
}

fn valid_scope(scope: &str) -> bool {
    !scope.is_empty()
        && scope
            .split('.')
            .all(|part| {
                !part.is_empty()
                    && part
                        .bytes()
                        .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_'))
            })
}

pub(crate) fn validate_directory(path: &Path) -> io::Result<()> {
    let kind = fs::symlink_metadata(path)?.file_type();
    if !kind.is_dir() || kind.is_symlink() {
        return Err(invalid("component path is not a directory"));
    }
    Ok(())
}

pub(crate) fn validate_file_id(value: &str) -> io::Result<()> {
    if value.len() > 32
        || value.split('-').count() != 6
        || value
            .split('-')
            .any(|part| part.is_empty() || !part.bytes().all(|byte| byte.is_ascii_digit()))
    {
        return Err(invalid("component bitmap history receipt"));
    }
    Ok(())
}

pub(crate) fn backup_bitmap(root: &Path, file_id: &str, operation: &str) -> io::Result<()> {
    use std::io::Write;
    let directory = root.join(".bit/bitmap-history");
    fs::create_dir_all(&directory)?;
    fs::copy(root.join(".bitmap"), directory.join(format!(".bitmap-{file_id}")))?;
    let mut metadata = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(root.join(".bit/bitmap-history-metadata.txt"))?;
    writeln!(metadata, "{file_id} {operation}")
}

fn invalid(message: &str) -> io::Error {
    io::Error::new(io::ErrorKind::InvalidInput, message)
}
