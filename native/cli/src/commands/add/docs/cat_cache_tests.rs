//! Unit tests for `cat-component` documentation cache [`cat_prepare`] preparation and reuse.
//!
//! Verifies that empty `cat-component` documentation entries are persisted once and reused on subsequent lookups.

use super::cat_prepare;
use serde_json::json;
use std::{fs, path::Path};

/// Verifies that an empty `cat-component` source entry is persisted once and reused without rewriting.
#[test]
fn proven_empty_cat_source_is_written_once_then_reused_without_rewrite() {
    let root = tempfile::tempdir().unwrap();
    fs::write(root.path().join("file.js"), "module.exports=42;\n").unwrap();
    fs::File::options()
        .write(true)
        .open(root.path().join("file.js"))
        .unwrap()
        .set_times(
            fs::FileTimes::new()
                .set_modified(std::time::UNIX_EPOCH + std::time::Duration::from_secs(1)),
        )
        .unwrap();
    let component = json!({"directory":".","files":[{"relativePath":"file.js","test":false}]});
    cat_prepare(root.path(), component.clone())
        .unwrap()
        .publish()
        .unwrap();
    let cache = root.path().join(".bit/cache/components/docs");
    let key = root.path().join("file.js");
    let entry =
        bit_object_import::read_dependency_cache(&cache, key.to_str().unwrap()).unwrap().unwrap();
    assert_eq!(entry["data"], "[]");
    let before = cache_bytes(&cache);
    cat_prepare(root.path(), component)
        .unwrap()
        .publish()
        .unwrap();
    assert_eq!(cache_bytes(&cache), before);
}

/// Computes the total byte size of all regular files recursively under `directory`.
/// Traverses nested bucket directories produced by `cacache`.
fn cache_bytes(directory: &Path) -> usize {
    fs::read_dir(directory)
        .unwrap()
        .map(Result::unwrap)
        .map(|entry| {
            if entry.file_type().unwrap().is_dir() {
                cache_bytes(&entry.path())
            } else {
                fs::metadata(entry.path()).unwrap().len() as usize
            }
        })
        .sum()
}

/// Verifies that an uncached source file containing `JSDoc` comments is reported as a cache miss.
#[test]
fn rich_uncached_cat_source_requires_published_parser() {
    let root = tempfile::tempdir().unwrap();
    fs::write(root.path().join("file.js"), "/** docs */\nmodule.exports=42;\n").unwrap();
    let component = json!({"directory":".","files":[{"relativePath":"file.js","test":false}]});
    let plan = cat_prepare(root.path(), component).unwrap();
    assert_eq!(plan.misses().len(), 1);
    assert!(
        !root
            .path()
            .join(".bit/cache/components/docs")
            .exists(),
    );
}

/// Verifies that a published-parser receipt leaves `cacache` writes owned by the host.
#[test]
fn published_parser_receipt_keeps_cache_writes_host_owned() {
    let root = tempfile::tempdir().unwrap();
    fs::write(root.path().join("file.js"), "/** @public */\nmodule.exports=2;\n").unwrap();
    let component = json!({"directory":".","files":[{"relativePath":"file.js","test":false}]});
    let mut plan = cat_prepare(root.path(), component).unwrap();
    assert_eq!(plan.misses().len(), 1);
    assert_eq!(plan.components().len(), 1);
    assert_eq!(
        plan.absorb(&json!({"published":true,"error":null}))
            .unwrap(),
        None,
    );
    plan.publish().unwrap();
    let cache = root.path().join(".bit/cache/components/docs");
    assert!(
        bit_object_import::read_dependency_cache(
            &cache,
            root.path()
                .join("file.js")
                .to_str()
                .unwrap()
        )
        .unwrap()
        .is_none(),
    );
}

#[test]
fn test_files_are_excluded_from_cat_docs_cache_misses() {
    let root = tempfile::tempdir().unwrap();
    fs::write(root.path().join("file.spec.js"), "/** @public */\nmodule.exports=2;\n").unwrap();
    let component = json!({"directory":".","files":[{"relativePath":"file.spec.js","test":true}]});
    let plan = cat_prepare(root.path(), component).unwrap();
    assert!(plan.misses().is_empty());
}
