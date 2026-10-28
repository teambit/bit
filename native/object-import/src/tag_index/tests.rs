use super::TagIndex;
#[test]
fn newest_tag_and_normal_versions_take_precedence() {
    let mut index = TagIndex::default();
    index.insert("a", "orphan-old", false);
    index.insert("a", "orphan-new", false);
    assert_eq!(index.get("a"), Some(("orphan-new", false)));
    index.insert("a", "normal-old", true);
    index.insert("a", "normal-new", true);
    assert_eq!(index.get("a"), Some(("normal-new", true)));
    assert_eq!(index.get("missing"), None);
}
#[test]
fn indexes_many_tagged_and_untagged_hashes() {
    let mut index = TagIndex::default();
    for i in 0..20_000 {
        index.insert(&format!("{i:040x}"), &format!("1.0.{i}"), true);
    }
    for i in 0..40_000 {
        let value = index.get(&format!("{i:040x}"));
        if i < 20_000 {
            assert_eq!(value.unwrap().0, format!("1.0.{i}"));
        } else {
            assert!(value.is_none());
        }
    }
}
