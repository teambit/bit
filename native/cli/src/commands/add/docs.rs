//! Native cache publication around the published semantic documentation parser.
use crate::commands::status::{cache, environments::Environments};
use serde_json::Value;
use std::{
    collections::BTreeMap,
    fs,
    io::{self, Read},
    path::{Path, PathBuf},
};
const LIMIT: u64 = 96 * 1024 * 1024;

pub(super) fn load(
    root: &Path,
    environment: &mut Environments,
    components: &[Value],
) -> io::Result<()> {
    let write_cache = !cache::no_fs_cache(root);
    let observed = observe(root, components)?;
    let writes: Value = environment.tracking_docs(root, components)?;
    if observed != observe(root, components)? {
        return Err(io::Error::other("tracking documentation sources changed"));
    }
    let writes = writes.as_array().ok_or_else(|| io::Error::other("tracking docs receipt"))?;
    let directory = bit_object_import::scope_path(root).join("cache/components/docs");
    let entries = validate(writes, &observed)?;
    for (path, bytes) in entries {
        if write_cache {
            bit_install::dependencies::cache::put(&directory, &path, &bytes)?;
        }
    }
    Ok(())
}
fn validate(
    writes: &[Value],
    observed: &BTreeMap<PathBuf, Vec<u8>>,
) -> io::Result<Vec<(String, String)>> {
    let mut total = 0;
    let mut entries = Vec::new();
    for row in writes {
        let path = row["path"].as_str().ok_or_else(|| io::Error::other("tracking docs path"))?;
        if !observed.contains_key(Path::new(path)) {
            return Err(io::Error::other("tracking docs unknown source"));
        }
        let bytes = bit_object_import::stringify_json(&row["docs"], false)?;
        total += bytes.len();
        if total > 32 * 1024 * 1024 {
            return Err(io::Error::other("tracking docs metadata budget"));
        }
        entries.push((path.to_owned(), bytes));
    }
    Ok(entries)
}
fn observe(root: &Path, components: &[Value]) -> io::Result<BTreeMap<PathBuf, Vec<u8>>> {
    let mut output = BTreeMap::new();
    let mut remaining = LIMIT;
    for component in components {
        let directory = component["directory"]
            .as_str()
            .ok_or_else(|| io::Error::other("tracking docs directory"))?;
        for file in
            component["files"].as_array().ok_or_else(|| io::Error::other("tracking docs files"))?
        {
            if file["test"] == true {
                continue;
            }
            let relative = file["relativePath"]
                .as_str()
                .ok_or_else(|| io::Error::other("tracking docs relative path"))?;
            let path = root.join(directory).join(relative);
            let bytes = read_source(&path, &mut remaining)?;
            output.insert(path, bytes);
            if output.len() > 16384 {
                return Err(io::Error::other("tracking docs file count budget"));
            }
        }
    }
    Ok(output)
}

fn read_source(path: &Path, remaining: &mut u64) -> io::Result<Vec<u8>> {
    if !fs::symlink_metadata(path)?.is_file() {
        return Err(io::Error::other("tracking docs nonordinary source"));
    }
    let mut bytes = Vec::new();
    fs::File::open(path)?
        .take(*remaining + 1)
        .read_to_end(&mut bytes)?;
    *remaining = remaining
        .checked_sub(bytes.len() as u64)
        .ok_or_else(|| io::Error::other("tracking docs source budget"))?;
    Ok(bytes)
}
