use super::{Options, find_cycles, parse_options};
use crate::commands::graph_cmd::model::CompGraph;

#[test]
fn parses_insights_list_flags() {
    assert_eq!(
        parse_options(&["-l"]),
        Some(Options { list: true, json: false, circular: false, include_deps: false }),
    );
    assert_eq!(
        parse_options(&["--list", "--json"]),
        Some(Options { list: true, json: true, circular: false, include_deps: false }),
    );
    assert_eq!(parse_options(&[]), None);
    assert_eq!(
        parse_options(&["circular"]),
        Some(Options { list: false, json: false, circular: true, include_deps: false }),
    );
    assert_eq!(parse_options(&["--list", "circular"]), None);
    assert_eq!(parse_options(&["circular", "--no-color"]), None);
    assert_eq!(
        parse_options(&["circular", "--json"]),
        Some(Options { list: false, json: true, circular: true, include_deps: false }),
    );
}

#[test]
fn finds_closed_cycles_without_acyclic_dependencies() {
    let mut graph = CompGraph::default();
    for (source, target) in
        [("a", "b"), ("b", "c"), ("c", "a"), ("a", "leaf"), ("x", "y"), ("y", "x")]
    {
        graph.add_edge(source.into(), target.into(), "prod");
    }
    let seeders = vec!["a".into(), "x".into()];
    assert_eq!(
        find_cycles(&graph, &seeders, false),
        vec![vec!["a", "b", "c", "a"], vec!["x", "y", "x"]],
    );
    assert_eq!(find_cycles(&graph, &["a".into()], false), vec![vec!["a", "b", "c", "a"]]);
    assert_eq!(
        find_cycles(&graph, &["a".into()], true),
        vec![vec!["a", "b", "c", "a"], vec!["x", "y", "x"]],
    );
}
