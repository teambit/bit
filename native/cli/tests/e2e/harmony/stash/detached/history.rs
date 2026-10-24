//! Status lazily persists existing ancestry even before the stash is allocated.
use super::{command, compare_stashes, controls, object_path, workspace};
use sha1::{Digest, Sha1};
use std::{fs, io::Read, path::Path};

#[test]
fn save_populates_missing_existing_history_before_detached_objects() {
    qualify(true);
}

#[test]
fn unmodified_save_still_populates_missing_existing_history() {
    qualify(false);
}

fn qualify(modified: bool) {
    let helper = workspace();
    let hash =
        format!("{:x}", Sha1::digest(format!("{}/comp1:VersionHistory", helper.scopes.remote)));
    let path = object_path(&helper.scopes.local_path, &hash);
    if path.exists() {
        fs::remove_file(&path).unwrap();
    }
    if modified {
        helper.output_file("comp1/index.js", "console.log('history stash');\n");
    }
    let oracle = helper.clone_workspace();
    assert!(!object_path(&oracle, &hash).exists());
    let before = controls(&helper.scopes.local_path);
    command(&helper, &oracle, "stash save --message history");
    assert_eq!(unpack(&helper.scopes.local_path, &hash), unpack(&oracle, &hash));
    assert_eq!(controls(&helper.scopes.local_path), before);
    compare_stashes(&helper.scopes.local_path, &oracle);
}

fn unpack(root: &Path, hash: &str) -> Vec<u8> {
    let packed = fs::read(object_path(root, hash)).unwrap();
    let mut bytes = Vec::new();
    flate2::read::ZlibDecoder::new(packed.as_slice()).read_to_end(&mut bytes).unwrap();
    assert!(bytes.starts_with(b"VersionHistory "));
    bytes
}
