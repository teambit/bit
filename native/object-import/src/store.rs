use std::{
    collections::HashMap,
    fs::{self, OpenOptions},
    io::{self, Write},
    path::{Path, PathBuf},
    sync::{
        Arc, Mutex,
        atomic::{AtomicU64, Ordering},
    },
};

static NEXT_TEMPORARY: AtomicU64 = AtomicU64::new(0);

pub(crate) struct Store {
    directory: PathBuf,
    owner: Option<(u32, u32)>,
    written: Mutex<HashMap<String, Arc<Mutex<bool>>>>,
}

impl Store {
    pub(crate) fn new(directory: PathBuf, owner: Option<(u32, u32)>) -> io::Result<Self> {
        if !directory.is_absolute() {
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                "object directory must be absolute",
            ));
        }
        Ok(Self { directory, owner, written: Mutex::new(HashMap::new()) })
    }

    pub(crate) fn write(&self, hash: &str, compressed: &[u8]) -> io::Result<()> {
        if hash.len() != 40
            || !hash
                .bytes()
                .all(|byte| byte.is_ascii_hexdigit() && !byte.is_ascii_uppercase())
        {
            return Err(io::Error::new(io::ErrorKind::InvalidInput, "invalid Source identity"));
        }
        let state = Arc::clone(
            self.written
                .lock()
                .map_err(|_| io::Error::other("Source write state poisoned"))?
                .entry(hash.into())
                .or_insert_with(|| Arc::new(Mutex::new(false))),
        );
        let mut completed =
            state.lock().map_err(|_| io::Error::other("Source write state poisoned"))?;
        if *completed {
            return Ok(());
        }
        let path = self.directory
            .join(&hash[..2])
            .join(&hash[2..]);
        let counter = NEXT_TEMPORARY.fetch_add(1, Ordering::Relaxed);
        let temporary =
            path.with_file_name(format!(".{}.{}.{}", &hash[2..], std::process::id(), counter));
        let result = Self::atomic_write(&path, &temporary, compressed, self.owner);
        if result.is_err() {
            let _cleanup = fs::remove_file(&temporary);
        }
        result?;
        *completed = true;
        Ok(())
    }

    pub(crate) fn finish_batch(&self) -> io::Result<()> {
        self.written
            .lock()
            .map_err(|_| io::Error::other("Source write state poisoned"))?
            .clear();
        Ok(())
    }

    /// Validate platform support and the existing index without publishing anything.
    pub(crate) fn validate_index_write(&self) -> io::Result<()> {
        let scope = self.directory.parent().ok_or_else(|| io::Error::other("missing scope"))?;
        #[cfg(target_os = "linux")]
        {
            open_index(&scope.join("index.json"))?;
            Ok(())
        }
        #[cfg(not(target_os = "linux"))]
        {
            in_place_target(&scope.join("index.json"))
        }
    }

    pub(crate) fn write_index(&self, contents: &[u8]) -> io::Result<()> {
        self.validate_index_write()?;
        let scope = self.directory.parent().ok_or_else(|| io::Error::other("missing scope"))?;
        let path = scope.join("index.json");
        let counter = NEXT_TEMPORARY.fetch_add(1, Ordering::Relaxed);
        let temporary = scope.join(format!(".index.json.{}.{}", std::process::id(), counter));
        let result = Self::atomic_index(&path, &temporary, contents);
        if result.is_err() {
            let _cleanup = fs::remove_file(&temporary);
        }
        result
    }

    /// Atomic metadata publication with the same proven owner/mode preservation as the index.
    pub(crate) fn validate_metadata_write(path: &Path) -> io::Result<()> {
        #[cfg(target_os = "linux")]
        {
            open_index(path)?;
            Ok(())
        }
        #[cfg(not(target_os = "linux"))]
        {
            in_place_target(path)
        }
    }

    pub(crate) fn write_metadata(path: &Path, contents: &[u8]) -> io::Result<()> {
        Self::validate_metadata_write(path)?;
        let parent = path.parent().ok_or_else(|| io::Error::other("metadata parent"))?;
        let counter = NEXT_TEMPORARY.fetch_add(1, Ordering::Relaxed);
        let temporary = parent.join(format!(".bit-metadata.{}.{}", std::process::id(), counter));
        let result = Self::atomic_index(path, &temporary, contents);
        if result.is_err() {
            let _cleanup = fs::remove_file(&temporary);
        }
        result
    }

    fn atomic_index(path: &Path, temporary: &Path, contents: &[u8]) -> io::Result<()> {
        #[cfg(target_os = "linux")]
        {
            let original = open_index(path)?;
            let metadata = original
                .as_ref()
                .map(fs::File::metadata)
                .transpose()?;
            let mut file = create(temporary, metadata.as_ref())?;
            file.write_all(contents)?;
            apply_metadata(temporary, metadata.as_ref(), None, caller_is_non_root(&file)?)?;
            if let Some(original) = original {
                copy_index_attributes(&original, &file)?;
            }
            check_index_metadata(&file, metadata.as_ref())?;
            file.sync_all()?;
            drop(file);
            fs::rename(temporary, path)
        }
        // `fs.writeJson`: written in place, so the file keeps its owner, mode,
        // ACL and extended attributes, as with the Node.js CLI.
        #[cfg(not(target_os = "linux"))]
        {
            let _ = temporary;
            in_place_target(path)?;
            let mut file = OpenOptions::new()
                .write(true)
                .create(true)
                .truncate(true)
                .open(path)?;
            file.write_all(contents)
        }
    }

    fn atomic_write(
        path: &Path,
        temporary: &Path,
        compressed: &[u8],
        owner: Option<(u32, u32)>,
    ) -> io::Result<()> {
        let existing = fs::metadata(path).ok();
        let mut file = match create(temporary, existing.as_ref()) {
            Ok(file) => file,
            Err(error) if error.kind() == io::ErrorKind::NotFound => {
                fs::create_dir_all(
                    path.parent().ok_or_else(|| io::Error::other("missing object parent"))?,
                )?;
                create(temporary, existing.as_ref())?
            }
            Err(error) => return Err(error),
        };
        file.write_all(compressed)?;
        apply_metadata(temporary, existing.as_ref(), owner, caller_is_non_root(&file)?)?;
        drop(file);
        fs::rename(temporary, path)
    }
}

fn create(path: &Path, existing: Option<&fs::Metadata>) -> io::Result<fs::File> {
    let mut options = OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::{MetadataExt, OpenOptionsExt};
        options.mode(existing.map_or(0o666, MetadataExt::mode));
    }
    #[cfg(not(unix))]
    let _metadata = existing;
    options.open(path)
}

fn caller_is_non_root(file: &fs::File) -> io::Result<bool> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;
        Ok(file.metadata()?.uid() != 0)
    }
    #[cfg(not(unix))]
    {
        let _file = file;
        Ok(true)
    }
}

fn acceptable_metadata_error(error: io::Error, non_root: bool) -> io::Result<()> {
    #[cfg(target_os = "linux")]
    let unimplemented = error.raw_os_error() == Some(38);
    #[cfg(target_os = "macos")]
    let unimplemented = error.raw_os_error() == Some(78);
    #[cfg(not(any(target_os = "linux", target_os = "macos")))]
    let unimplemented = false;
    if unimplemented || non_root && matches!(error.raw_os_error(), Some(1 | 22)) {
        Ok(())
    } else {
        Err(error)
    }
}

fn apply_metadata(
    path: &Path,
    existing: Option<&fs::Metadata>,
    owner: Option<(u32, u32)>,
    non_root: bool,
) -> io::Result<()> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;
        let owner = owner.or_else(|| existing.map(|metadata| (metadata.uid(), metadata.gid())));
        if let Some((uid, gid)) = owner {
            std::os::unix::fs::chown(path, Some(uid), Some(gid))
                .or_else(|error| acceptable_metadata_error(error, non_root))?;
        }
    }
    #[cfg(not(unix))]
    let _owner = owner;
    if let Some(metadata) = existing {
        fs::set_permissions(path, metadata.permissions())
            .or_else(|error| acceptable_metadata_error(error, non_root))?;
    }
    Ok(())
}

#[cfg(test)]
mod tests;

/// An index written in place: a regular file with one link and no set-id
/// bits, as `open_index` requires on Linux, or none yet.
#[cfg(not(target_os = "linux"))]
fn in_place_target(path: &Path) -> io::Result<()> {
    match fs::symlink_metadata(path) {
        Ok(metadata) if !metadata.is_file() || !canonical_links(&metadata) => {
            Err(io::Error::other("non-canonical index file"))
        }
        Ok(_) => Ok(()),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error),
    }
}

#[cfg(target_os = "linux")]
fn open_index(path: &Path) -> io::Result<Option<fs::File>> {
    use std::os::unix::fs::MetadataExt;
    match fs::symlink_metadata(path) {
        Ok(metadata) => {
            if !metadata.is_file() || metadata.nlink() != 1 || metadata.mode() & 0o6000 != 0 {
                return Err(io::Error::other("non-canonical index file"));
            }
            Ok(Some(OpenOptions::new().write(true).open(path)?))
        }
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(error),
    }
}
#[cfg(target_os = "linux")]
fn copy_index_attributes(original: &fs::File, file: &fs::File) -> io::Result<()> {
    use xattr::FileExt;
    let mut attributes: Vec<_> = original.list_xattr()?.collect();
    let acl = std::ffi::OsString::from("system.posix_acl_access");
    if !attributes.contains(&acl) {
        attributes.push(acl);
    }
    if attributes.len() > 64 {
        return Err(io::Error::other("index attribute count"));
    }
    let mut bytes = 0;
    for name in attributes {
        let Some(value) = original.get_xattr(&name)? else {
            if file.get_xattr(&name)?.is_some() {
                file.remove_xattr(name)?;
            }
            continue;
        };
        bytes += value.len();
        if bytes > 1024 * 1024 {
            return Err(io::Error::other("index attribute bounds"));
        }
        file.set_xattr(name, &value)?;
    }
    Ok(())
}

#[cfg(target_os = "linux")]
fn check_index_metadata(file: &fs::File, existing: Option<&fs::Metadata>) -> io::Result<()> {
    use std::os::unix::fs::MetadataExt;
    let Some(existing) = existing else {
        return Ok(());
    };
    let current = file.metadata()?;
    if current.uid() != existing.uid()
        || current.gid() != existing.gid()
        || current.mode() != existing.mode()
    {
        return Err(io::Error::other("index metadata could not be preserved"));
    }
    Ok(())
}

#[cfg(all(unix, not(target_os = "linux")))]
fn canonical_links(metadata: &fs::Metadata) -> bool {
    use std::os::unix::fs::MetadataExt;
    metadata.nlink() == 1 && metadata.mode() & 0o6000 == 0
}

#[cfg(not(unix))]
fn canonical_links(_metadata: &fs::Metadata) -> bool {
    true
}
