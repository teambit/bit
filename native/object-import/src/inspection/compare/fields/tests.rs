use super::{Js, align_files, array, get, text};
use serde_json::json;
fn row(path: Js, name: &str) -> Js {
    Js::Object(vec![
        ("relativePath".encode_utf16().collect(), path),
        ("name".encode_utf16().collect(), Js::text(name)),
        ("test".encode_utf16().collect(), Js::Boolean(false)),
    ])
}
fn files(rows: Vec<Js>) -> Js {
    Js::Object(vec![("files".encode_utf16().collect(), Js::Array(rows))])
}
#[test]
fn alignment_preserves_first_duplicates_unmatched_rows_and_utf16_identity() {
    let model = files(vec![
        row(Js::Null, "invalid"),
        row(Js::text("a"), "first"),
        row(Js::text("a"), "second"),
        row(Js::text("b"), "bee"),
        row(Js::String(vec![0xd800]), "surrogate"),
        row(Js::text("\u{fffd}"), "replacement"),
    ]);
    let mut current = files(vec![
        row(Js::text("b"), "old"),
        row(Js::text("a"), "old"),
        row(Js::String(vec![0xd800]), "old"),
        row(Js::text("absent"), "untouched"),
        row(Js::text("\u{fffd}"), "old"),
    ]);
    let metadata = align_files(&model, &mut current).unwrap();
    assert_eq!(
        json!(metadata),
        json!([
            {"index":0,"modelIndex":3}, {"index":1,"modelIndex":1},
            {"index":2,"modelIndex":4}, {"index":4,"modelIndex":5}
        ]),
    );
    for (row, expected) in array(get(&current, "files"))
        .unwrap()
        .iter()
        .zip(["bee", "first", "surrogate", "untouched", "replacement"])
    {
        assert_eq!(text(get(row, "name")).unwrap(), expected.encode_utf16().collect::<Vec<_>>());
    }
}
#[test]
fn invalid_current_path_leaves_all_input_rows_unchanged() {
    let model = files(vec![row(Js::text("a"), "new")]);
    let mut current = files(vec![row(Js::text("a"), "old"), row(Js::Null, "invalid")]);
    let before = serde_json::to_value(&current).unwrap();
    assert_eq!(
        align_files(&model, &mut current).unwrap_err().to_string(),
        "inspection expected string",
    );
    assert_eq!(serde_json::to_value(&current).unwrap(), before);
}
#[test]
fn large_reversed_file_set_keeps_original_model_positions() {
    let model = files(
        (0..513)
            .map(|index| row(Js::text(&format!("file-{index}")), "model"))
            .collect(),
    );
    let mut current = files(
        (0..513)
            .rev()
            .map(|index| row(Js::text(&format!("file-{index}")), "current"))
            .collect(),
    );
    let metadata = align_files(&model, &mut current).unwrap();
    assert_eq!(metadata.len(), 513);
    for (index, entry) in metadata.iter().enumerate() {
        assert_eq!(entry, &json!({"index":index,"modelIndex":512-index}));
    }
}
