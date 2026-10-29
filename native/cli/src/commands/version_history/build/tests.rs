use super::complete;
use serde_json::json;

#[test]
fn proves_complete_parents_and_respects_recorded_complete_heads() {
    let complete_graph = json!({"versions":[{"hash":"first","parents":[]},{"hash":"second","parents":["first"]}],"graphCompleteRefs":[]});
    assert_eq!(complete(&complete_graph, "second"), Some(true));
    assert_eq!(complete(&complete_graph, "missing"), Some(false));
    let incomplete =
        json!({"versions":[{"hash":"second","parents":["first"]}],"graphCompleteRefs":[]});
    assert_eq!(complete(&incomplete, "second"), Some(false));
    let recorded = json!({"versions":[],"graphCompleteRefs":["second"]});
    assert_eq!(complete(&recorded, "second"), Some(true));
}

#[test]
fn handles_cycles_without_recursion_and_rejects_ambiguous_rows() {
    let cycle = json!({"versions":[{"hash":"first","parents":["second"]},{"hash":"second","parents":["first"]}],"graphCompleteRefs":[]});
    assert_eq!(complete(&cycle, "first"), Some(true));
    let duplicates = json!({"versions":[{"hash":"first","parents":[]},{"hash":"first","parents":[]}],"graphCompleteRefs":[]});
    assert_eq!(complete(&duplicates, "first"), None);
}
