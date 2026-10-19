use super::cache_only;
use serde_json::json;
use std::{fs, path::Path};

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
    cache_only(root.path(), component.clone())
        .unwrap()
        .unwrap()
        .publish()
        .unwrap();
    let cache = root.path().join(".bit/cache/components/docs");
    let key = root.path().join("file.js");
    let entry =
        bit_object_import::read_dependency_cache(&cache, key.to_str().unwrap()).unwrap().unwrap();
    assert_eq!(entry["data"], "[]");
    let before = cache_bytes(&cache);
    cache_only(root.path(), component)
        .unwrap()
        .unwrap()
        .publish()
        .unwrap();
    assert_eq!(cache_bytes(&cache), before);
}

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

#[test]
fn rich_uncached_cat_source_requires_published_parser() {
    let root = tempfile::tempdir().unwrap();
    fs::write(root.path().join("file.js"), "/** docs */\nmodule.exports=42;\n").unwrap();
    let component = json!({"directory":".","files":[{"relativePath":"file.js","test":false}]});
    assert!(cache_only(root.path(), component).unwrap().is_none());
    assert!(
        !root
            .path()
            .join(".bit/cache/components/docs")
            .exists(),
    );
}
