use super::{Chalk, Options, normalize, ordered_parents, paint, parse, render};
use serde_json::json;

#[test]
fn parses_local_and_remote_history_views() {
    let options = parse(&["alpha", "--one-line", "--full-hash"]).unwrap();
    assert_eq!(options.id, Some("alpha"));
    assert!(options.one_line && options.full_hash);
    assert!(parse(&["acme.ui/alpha", "--remote"]).unwrap().remote);
    assert!(parse(&["alpha", "beta"]).is_none());
}

#[test]
fn remote_rows_keep_full_hash_and_message_in_one_line_output() {
    let rows = [json!({
        "message":"first\nsecond", "username":null, "email":"a@example.com",
        "date":"1800000000000", "hash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "tag":null,
    })];
    let options = Options { remote: true, one_line: true, ..Options::default() };
    let report = render(&rows, &options, Chalk::new(false)).unwrap();
    let report = report.as_str().unwrap();
    assert!(report.contains("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"));
    assert!(report.contains("first \n"));
    assert!(report.contains("second"));
    let options = Options { remote: true, ..Options::default() };
    let report = render(&rows, &options, Chalk::new(false)).unwrap();
    assert!(
        report
            .as_str()
            .unwrap()
            .contains("author: <a@example.com>"),
    );
    assert!(
        report
            .as_str()
            .unwrap()
            .contains("date: 1800000000000"),
    );
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
    assert!(ordered_parents(&[head]).is_err());
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

#[test]
fn parents_view_orders_a_merge_before_both_parents() {
    let logs = [
        json!({"hash":"left","parents":["root"]}),
        json!({"hash":"right","parents":["root"]}),
        json!({"hash":"merge","parents":["right","left"]}),
        json!({"hash":"root","parents":[]}),
    ];
    let ordered = ordered_parents(&logs).unwrap();
    let hashes: Vec<_> = ordered
        .iter()
        .map(|row| row["hash"].as_str().unwrap())
        .collect();
    assert_eq!(hashes, ["merge", "right", "left", "root"]);
}
