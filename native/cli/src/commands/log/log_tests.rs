use super::{Chalk, Options, linear_parents, normalize, ordered_parents, paint, parse, render};
use serde_json::json;

#[test]
fn parses_local_history_views_and_delegates_remote_flags() {
    let options = parse(&["alpha", "--one-line", "--full-hash"]).unwrap();
    assert_eq!(options.id, Some("alpha"));
    assert!(options.one_line && options.full_hash);
    assert!(parse(&["alpha", "--remote"]).is_none());
    assert!(parse(&["alpha", "beta"]).is_none());
}

#[test]
fn normalizes_a_version_log_and_renders_the_default_report() {
    let row = json!({
        "log": { "message":"initial", "date":"1800000005000", "username":"Z", "email":"z@example.com" },
        "tag":"1.0.0", "hash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "parents":[],
        "onLane":false, "deleted":false,
    });
    let row = normalize(&row).unwrap();
    assert_eq!(row["tag"], "1.0.0");
    assert_eq!(row["date"].as_str().unwrap().len(), 19);
    assert!(paint(&row, Chalk::new(false)).unwrap().contains("tag 1.0.0 (aaaaaaaa"));
    let output = render(&[row], &Options::default(), Chalk::new(false)).unwrap();
    assert!(
        output
            .as_str()
            .unwrap()
            .contains("author: Z <z@example.com>"),
    );
}

#[test]
fn parents_view_delegates_when_a_hidden_parent_is_missing() {
    let head = json!({"hash":"aaaaaaaaa","parents":["bbbbbbbbb"]});
    assert!(!linear_parents(&[head]));
}

#[test]
fn parents_view_follows_history_edges_even_when_dates_are_out_of_order() {
    let logs = [
        json!({"hash":"bbbbbbbbb","parents":["aaaaaaaaa"]}),
        json!({"hash":"aaaaaaaaa","parents":[]}),
        json!({"hash":"ccccccccc","parents":["bbbbbbbbb"]}),
    ];
    let ordered = ordered_parents(&logs).unwrap();
    let hashes: Vec<_> = ordered
        .iter()
        .map(|row| row["hash"].as_str().unwrap())
        .collect();
    assert_eq!(hashes, ["ccccccccc", "bbbbbbbbb", "aaaaaaaaa"]);
}
