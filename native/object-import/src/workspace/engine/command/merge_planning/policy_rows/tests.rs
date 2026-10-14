use super::sorted_files;
use serde_json::json;

#[test]
fn dependency_roots_follow_bitmap_sort_without_reordering_materials() {
    let files = vec![
        json!({"relativePath":"index.js"}),
        json!({"relativePath":"fresh.test.ts"}),
        json!({"relativePath":"fresh.spec.js"}),
        json!({"relativePath":"\u{e000}.js"}),
        json!({"relativePath":"\u{10000}.js"}),
    ];
    assert_eq!(
        sorted_files(&files),
        vec!["fresh.spec.js", "fresh.test.ts", "index.js", "\u{10000}.js", "\u{e000}.js"],
    );
    assert_eq!(files[0]["relativePath"], "index.js");
}
