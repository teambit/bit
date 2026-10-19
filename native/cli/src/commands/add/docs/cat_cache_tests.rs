use super::cat_prepare;
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
    let plan = cat_prepare(root.path(), component).unwrap();
    assert_eq!(plan.misses().len(), 1);
    assert!(
        !root
            .path()
            .join(".bit/cache/components/docs")
            .exists(),
    );
}

#[test]
fn later_parse_failure_publishes_only_completed_docs_prefix() {
    let root = tempfile::tempdir().unwrap();
    fs::write(root.path().join("first.js"), "module.exports=1;\n").unwrap();
    fs::write(root.path().join("second.js"), "/** @public */\nmodule.exports=2;\n").unwrap();
    fs::write(root.path().join("third.js"), "/** @public */\nmodule.exports=3;\n").unwrap();
    fs::write(root.path().join("fourth.js"), "module.exports=4;\n").unwrap();
    let component = json!({"directory":".","files":[
        {"relativePath":"first.js","test":false},
        {"relativePath":"second.js","test":false},
        {"relativePath":"third.js","test":false},
        {"relativePath":"fourth.js","test":false}
    ]});
    let mut plan = cat_prepare(root.path(), component).unwrap();
    assert_eq!(plan.misses().len(), 1);
    let second = root.path().join("second.js");
    let third = root.path().join("third.js");
    fs::remove_file(&third).unwrap();
    let result = plan
        .absorb(&json!({
            "writes":[{"path":second,"docs":[{"name":"second"}]}],
            "failedAt":third,
            "error":"third source vanished"
        }))
        .unwrap();
    assert_eq!(result.as_deref(), Some("third source vanished"));
    let cache = root.path().join(".bit/cache/components/docs");
    for name in ["first.js", "second.js"] {
        assert!(
            bit_object_import::read_dependency_cache(
                &cache,
                root.path().join(name).to_str().unwrap()
            )
            .unwrap()
            .is_some(),
        );
    }
    for name in ["third.js", "fourth.js"] {
        assert!(
            bit_object_import::read_dependency_cache(
                &cache,
                root.path().join(name).to_str().unwrap()
            )
            .unwrap()
            .is_none(),
        );
    }
}
