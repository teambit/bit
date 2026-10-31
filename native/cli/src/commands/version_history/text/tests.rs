use super::{Chalk, render};
use serde_json::json;

#[test]
fn linear_history_orders_heads_first_and_preserves_pointers() {
    let first = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    let second = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    let history =
        json!({"versions":[{"hash":first,"parents":[]},{"hash":second,"parents":[first]}]});
    let model = json!({"head":second,"versions":{"1.0.0":first,"2.0.0":second}});
    assert_eq!(
        render(&history, &model, true, Chalk::new(false), &[]).unwrap(),
        "bbbbbbbbb (main, 2.0.0) aaaaaaaaa (parent)\naaaaaaaaa (1.0.0) ",
    );
}

#[test]
fn ambiguous_and_cyclic_graphs_decline() {
    let first = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    let second = "aaaaaaaaabbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    let model = json!({"versions":{}});
    let chain = json!({"versions":[{"hash":first,"parents":[]},{"hash":second,"parents":[first]}]});
    assert!(render(&chain, &model, true, Chalk::new(false), &[]).is_none());
    let graph =
        json!({"versions":[{"hash":first,"parents":[second]},{"hash":second,"parents":[first]}]});
    assert!(render(&graph, &model, false, Chalk::new(false), &[]).is_none());
    let duplicates =
        json!({"versions":{"1.0.0":first,"2.0.0":first},"orphanedVersions":{"3.0.0":first}});
    let rendered = render(&chain, &duplicates, false, Chalk::new(false), &[]).unwrap();
    assert!(rendered.contains("(2.0.0)"));
    assert!(!rendered.contains("(3.0.0)"));
}
