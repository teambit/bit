use super::{Config, hash};
use serde_json::json;

#[test]
fn generated_configuration_name_matches_released_object_hash() {
    let root = tempfile::tempdir().unwrap();
    let config = Config::prepare(root.path(), "sample").unwrap();
    assert_eq!(
        config.path.file_name().unwrap(),
        "bit.tsconfig.eslint.26e769456ec718fdfcaa0c55b0ce1f76a888ce82.json",
    );
    assert!(
        !root
            .path()
            .join("node_modules")
            .exists(),
    );
    assert!(config.bytes.ends_with(b"\n"));
}

#[test]
fn plain_object_hash_preserves_prototypes_and_unicode_string_lengths() {
    assert_eq!(hash::hash(&json!({})).unwrap(), "323217f643c3e3f1fe7532e72ac01bb0748c97be");
    assert_eq!(
        hash::hash(&json!({"a":{"b":true},"z":["😀",false]})).unwrap(),
        "e7c8f40d727445d519646a008ea61fe89136d458",
    );
    for value in [json!([]), json!({"constructor":"override"}), json!({"value":0.1})] {
        assert!(hash::hash(&value).is_err());
    }
}
