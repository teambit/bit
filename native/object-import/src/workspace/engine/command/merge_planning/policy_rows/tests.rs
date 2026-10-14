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

#[test]
fn added_component_uses_model_prefix_without_fabricating_current_metadata() {
    let current = crate::workspace::engine::command::capture::addition(
        "scope/component",
        &json!({"scope":"scope","name":"component","rootDir":"component"}),
    )
    .unwrap();
    let mut context =
        json!({"models":[{"scope":"scope","name":"component","bindingPrefix":"@custom"}]});
    assert_eq!(super::binding_prefix(&current, &context).unwrap(), "@custom");
    context["models"][0]["bindingPrefix"] = json!("");
    assert_eq!(super::binding_prefix(&current, &context).unwrap(), "@scope");
    assert_eq!(current.target.current, json!({}));
}
