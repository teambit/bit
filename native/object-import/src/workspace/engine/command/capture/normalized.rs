//! Root bitmap Sources retain canonical bytes alongside proofs of the original physical input.
use super::{comparison, read};
use crate::workspace::snapshots;
use std::{collections::HashSet, io, path::Path};

pub(super) fn read(
    root: &Path,
    targets: &[comparison::Target],
    pool: &rayon::ThreadPool,
) -> io::Result<Vec<(read::Metadata, Vec<u8>)>> {
    let mut paths = Vec::new();
    let mut bitmaps = HashSet::new();
    for target in targets {
        for file in &target.files {
            let path = comparison::capture::source_path(root, target, file)?;
            if is_root_bitmap(&target.directory, file) {
                bitmaps.insert(path.clone());
            }
            paths.push(path);
        }
    }
    read::read_with_budget(&paths, pool, snapshots::MAX_BYTES, |path, bytes| {
        one(path, bytes, bitmaps.contains(path))
    })?
    .into_iter()
    .collect()
}

fn one(path: &Path, bytes: Vec<u8>, bitmap: bool) -> io::Result<(read::Metadata, Vec<u8>)> {
    let (mut metadata, contents) = read::canonical(path, bytes);
    if !bitmap {
        return Ok((metadata, contents));
    }
    let normalized = crate::inspection::normalize_bitmap(&contents)?;
    let (canonical, _) = read::canonical(path, normalized);
    metadata.linux_hash = canonical.linux_hash;
    Ok((metadata, contents))
}

fn is_root_bitmap(directory: &str, file: &str) -> bool {
    let clean_dir = directory
        .trim()
        .trim_end_matches(['/', '\\']);
    let clean_file = file
        .trim()
        .strip_prefix("./")
        .unwrap_or_else(|| file.trim());
    (clean_dir.is_empty() || clean_dir == ".") && clean_file == ".bitmap"
}
