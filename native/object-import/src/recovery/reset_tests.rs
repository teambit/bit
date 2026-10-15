use super::{plan, walk};
use serde_json::{Value, json};
fn hash(byte: char) -> String {
    std::iter::repeat_n(byte, 40).collect()
}
fn input() -> Value {
    json!({"objectsDirectory":std::env::temp_dir(),"versions":[],"deletedRefs":[],"removeOnlyHead":false,"laneHidden":false,"laneNew":false,"hasScope":false,"tags":[],"orphaned":[],"detachedHeads":[]})
}
#[test]
fn common_shortcut_avoids_repository_reads_and_keeps_common_identity() {
    let mut request = input();
    request["objectsDirectory"] = json!(std::env::temp_dir().join("nonexistent-reset-repo"));
    request["head"] = json!(hash('a'));
    request["laneHead"] = json!(hash('a'));
    request["common"] = json!(hash('b'));
    request["deletedRefs"] = json!([hash('a')]);
    let result = plan(&request).unwrap();
    assert_eq!(result["newHead"], json!({"common":true}));
    assert_eq!(result["removeLane"], true);
    request["laneHeadRemote"] = json!(hash('c'));
    assert_eq!(plan(&request).unwrap()["removeLane"], false);
}
#[test]
fn walk_preserves_first_loaded_parent_provenance_and_declines_cycles() {
    let versions =
        json!([{"hash":hash('a'),"parents":[hash('b')]},{"hash":hash('b'),"parents":[hash('c')]}]);
    let result = walk(versions.as_array().unwrap(), &hash('a')).unwrap();
    assert_eq!(result.provenance, Some(json!({"parent":{"versionIndex":1,"parentIndex":0}})));
    assert!(!result.common);
    let cycle = json!([{"hash":hash('a'),"parents":[hash('a')]}]);
    assert!(walk(cycle.as_array().unwrap(), &hash('a')).is_err());
    let multiple = json!([{"hash":hash('a'),"parents":[hash('b'),hash('c')]}]);
    assert!(walk(multiple.as_array().unwrap(), &hash('a')).is_err());
}
#[test]
fn detached_selection_and_hash_labels_do_not_delete_tags() {
    let mut request = input();
    request["versions"] = json!([{"label":hash('a'),"hash":hash('a')}]);
    request["deletedRefs"] = json!([hash('a')]);
    request["tags"] = json!([{"label":"1.0.0","hash":hash('a')}]);
    request["detachedHeads"] = json!([hash('a'), hash('b'), hash('a')]);
    request["detachedCurrent"] = json!(hash('a'));
    let result = plan(&request).unwrap();
    assert_eq!(result["keepComponent"], true);
    assert_eq!(result["detachedRetained"], json!([1]));
    assert_eq!(result["clearDetachedCurrent"], true);
}
#[test]
fn orphaned_tag_precedence_and_missing_tags_are_preflighted() {
    let mut request = input();
    request["versions"] = json!([{"label":"1.0.0","hash":hash('b')}]);
    request["tags"] = json!([{"label":"1.0.0","hash":hash('a')}]);
    request["orphaned"] = json!([{"label":"1.0.0","hash":hash('b')}]);
    assert_eq!(plan(&request).unwrap()["keepComponent"], false);
    request["versions"][0]["hash"] = json!(hash('a'));
    assert!(plan(&request).is_err());
    request["orphaned"] = json!([]);
    request["tags"] = json!([]);
    assert!(plan(&request).is_err());
}
struct Fixture(std::path::PathBuf);
impl Fixture {
    fn new() -> Self {
        use std::sync::atomic::{AtomicUsize, Ordering};
        static NEXT: AtomicUsize = AtomicUsize::new(0);
        let root = std::env::temp_dir()
            .join(format!(
                "bit-reset-{}-{}",
                std::process::id(),
                NEXT.fetch_add(1, Ordering::Relaxed),
            ));
        std::fs::create_dir_all(&root).unwrap();
        Self(root)
    }
    fn write(&self, reference: &str, parents: &[String]) {
        use std::io::Write;
        let path = self.0
            .join(&reference[..2])
            .join(&reference[2..]);
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        let mut encoder =
            flate2::write::ZlibEncoder::new(Vec::new(), flate2::Compression::default());
        encoder
            .write_all(format!("Version {reference} 1\0").as_bytes())
            .unwrap();
        encoder
            .write_all(
                &serde_json::to_vec(
                    &json!({"mainFile":"index.js","files":[],"parents":parents,"log":{}}),
                )
                .unwrap(),
            )
            .unwrap();
        std::fs::write(path, encoder.finish().unwrap()).unwrap();
    }
    fn request(&self) -> Value {
        let mut request = input();
        request["objectsDirectory"] = json!(self.0);
        request["head"] = json!(hash('a'));
        request["deletedRefs"] = json!([hash('a'), hash('b')]);
        request["versions"] = json!([{"label":hash('a'),"hash":hash('a'),"parents":[hash('b')]},{"label":hash('b'),"hash":hash('b'),"parents":[hash('c')]}]);
        request
    }
}
impl Drop for Fixture {
    fn drop(&mut self) {
        let _removed = std::fs::remove_dir_all(&self.0);
    }
}
#[test]
fn reset_reads_mutable_versions_fresh_and_rejects_cached_parent_mismatch() {
    let fixture = Fixture::new();
    fixture.write(&hash('a'), &[hash('b')]);
    fixture.write(&hash('b'), &[hash('c')]);
    let mut request = fixture.request();
    assert_eq!(
        plan(&request).unwrap()["newHead"],
        json!({"parent":{"versionIndex":1,"parentIndex":0}}),
    );
    fixture.write(&hash('b'), &[hash('d')]);
    assert!(plan(&request).is_err());
    request["versions"][1]["parents"] = json!([hash('d')]);
    assert!(plan(&request).is_ok());
    std::fs::remove_file(
        fixture.0
            .join("aa")
            .join(&hash('a')[2..]),
    )
    .unwrap();
    assert!(plan(&request).is_err());
}
#[test]
fn surviving_parent_and_remaining_tag_failures_are_preflighted() {
    let fixture = Fixture::new();
    fixture.write(&hash('a'), &[hash('b')]);
    fixture.write(&hash('b'), &[]);
    let mut request = fixture.request();
    request["versions"][1]["parents"] = json!([]);
    request["laneHead"] = json!(hash('b'));
    request["deletedRefs"] = json!([hash('b')]);
    assert!(plan(&request).is_err());
    request
        .as_object_mut()
        .unwrap()
        .remove("laneHead");
    request["deletedRefs"] = json!([hash('a'), hash('b')]);
    request["tags"] = json!([{"label":"1.0.0","hash":hash('a')}]);
    assert!(plan(&request).is_err());
}
#[test]
fn parent_common_identity_controls_lane_removal_without_hash_inference() {
    let fixture = Fixture::new();
    fixture.write(&hash('a'), &[hash('b')]);
    fixture.write(&hash('b'), &[hash('c')]);
    let mut request = fixture.request();
    request["laneHead"] = json!(hash('a'));
    request["common"] = json!(hash('c'));
    request["removeOnlyHead"] = json!(true);
    assert_eq!(plan(&request).unwrap()["removeLane"], false);
    request["versions"][1]["commonParentIndices"] = json!([0]);
    assert_eq!(plan(&request).unwrap()["removeLane"], true);
    request["versions"][1]["commonParentIndices"] = json!([1]);
    assert!(plan(&request).is_err());
}
