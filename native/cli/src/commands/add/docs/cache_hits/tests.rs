use super::{hit, prepare};
use crate::commands::add::docs::sources::observe;
use serde_json::json;
use std::{fs, path::Path};

fn seed(cache: &Path, path: &Path, docs: &str) -> f64 {
    bit_install::dependencies::cache::put(cache, path.to_str().unwrap(), docs).unwrap();
    bit_object_import::read_dependency_cache(cache, path.to_str().unwrap())
        .unwrap().unwrap()["timestamp"].as_f64().unwrap()
}

#[test]
fn hit_accepts_arbitrary_metadata_and_exact_timestamp_but_not_fractionally_newer_source() {
    let directory = tempfile::tempdir().unwrap();
    let cache = directory.path().join("docs");
    let path = directory.path().join("file.js");
    let timestamp = seed(&cache, &path, r#"{"react":{"description":"cached"}}"#);
    let expected = Some(json!({"react":{"description":"cached"}}));
    assert_eq!(hit(&cache, &path, timestamp, true).unwrap(), expected);
    assert_eq!(hit(&cache, &path, timestamp - 0.25, true).unwrap(), expected);
    assert!(hit(&cache, &path, timestamp + 0.25, true).unwrap().is_none());
}

#[test]
fn disabled_cache_does_not_even_open_the_cache_path() {
    let directory = tempfile::tempdir().unwrap();
    let cache = directory.path().join("docs");
    fs::write(&cache, "not a cache directory").unwrap();
    assert!(hit(&cache, &directory.path().join("file.js"), 0.0, false).unwrap().is_none());
}

#[test]
fn malformed_cached_json_defers_the_entire_batch_to_the_published_reader() {
    let directory = tempfile::tempdir().unwrap();
    let root = directory.path();
    let cache = root.join("docs");
    fs::write(root.join("first.js"), "module.exports=1;").unwrap();
    fs::write(root.join("second.js"), "module.exports=2;").unwrap();
    for name in ["first.js", "second.js"] {
        fs::File::options()
            .write(true)
            .open(root.join(name))
            .unwrap()
            .set_times(
                fs::FileTimes::new()
                    .set_modified(std::time::UNIX_EPOCH + std::time::Duration::from_secs(1)),
            )
            .unwrap();
    }
    seed(&cache, &root.join("first.js"), "[]");
    seed(&cache, &root.join("second.js"), "invalid-json");
    let components = vec![
        json!({"directory":".","files":[{"relativePath":"first.js"},{"relativePath":"second.js"}]}),
    ];
    let observed = observe(root, &components).unwrap();
    let plan = prepare(root, &cache, &components, &observed, true);
    assert!(plan.hits.is_empty());
    assert!(plan.proven.is_empty());
    assert_eq!(plan.misses, components);
}

#[test]
fn proven_empty_miss_produces_metadata_and_a_new_cache_write() {
    let directory = tempfile::tempdir().unwrap();
    let root = directory.path();
    fs::write(root.join("file.js"), "module.exports=42;\n").unwrap();
    let components = vec![json!({"directory":".","files":[{"relativePath":"file.js"}]})];
    let observed = observe(root, &components).unwrap();
    let plan = prepare(root, &root.join("docs"), &components, &observed, true);
    assert!(plan.misses.is_empty());
    assert_eq!(plan.hits, plan.proven);
    assert_eq!(plan.proven, vec![json!({"path":root.join("file.js"),"docs":[]})]);
}

#[test]
fn no_cache_uncertain_source_still_uses_the_published_parser() {
    let directory = tempfile::tempdir().unwrap();
    let root = directory.path();
    fs::write(root.join("file.js"), "module.exports=()=>42;\n").unwrap();
    let components = vec![json!({"directory":".","files":[{"relativePath":"file.js"}]})];
    let observed = observe(root, &components).unwrap();
    let plan = prepare(root, &root.join("docs"), &components, &observed, false);
    assert!(plan.hits.is_empty());
    assert!(plan.proven.is_empty());
    assert_eq!(plan.misses, components);
}

#[test]
fn disabled_cache_proven_source_never_reads_or_creates_cache_files() {
    let directory = tempfile::tempdir().unwrap();
    let root = directory.path();
    fs::write(root.join("file.js"), "module.exports=42;").unwrap();
    let cache = root.join("docs");
    let components = vec![json!({"directory":".","files":[{"relativePath":"file.js"}]})];
    let observed = observe(root, &components).unwrap();
    let plan = prepare(root, &cache, &components, &observed, false);
    assert!(plan.misses.is_empty());
    assert_eq!(plan.proven.len(), 1);
    assert!(!cache.exists());
}
