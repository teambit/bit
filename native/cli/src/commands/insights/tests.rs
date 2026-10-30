use super::{Options, find_cycles, has_duplicate_versions, parse_options};
use crate::commands::graph_cmd::model::CompGraph;

#[test]
fn parses_insights_list_and_named_flags() {
    assert_eq!(
        parse_options(&["-l"]),
        Some(Options { list: true, json: false, include_deps: false, names: Vec::new() }),
    );
    assert_eq!(
        parse_options(&["--list", "--json"]),
        Some(Options { list: true, json: true, include_deps: false, names: Vec::new() }),
    );
    assert_eq!(parse_options(&[]), None);
    assert_eq!(
        parse_options(&["circular"]),
        Some(Options {
            list: false,
            json: false,
            include_deps: false,
            names: vec!["circular".into()],
        }),
    );
    assert_eq!(parse_options(&["--list", "circular"]), None);
    assert_eq!(
        parse_options(&["circular", "--no-color"]),
        Some(Options {
            list: false,
            json: false,
            include_deps: false,
            names: vec!["circular".into()],
        }),
    );
    assert_eq!(
        parse_options(&["circular", "duplicate dependencies", "--json"]),
        Some(Options {
            list: false,
            json: true,
            include_deps: false,
            names: vec!["circular".into(), "duplicate dependencies".into()],
        }),
    );
}

#[test]
fn detects_duplicate_version_nodes_in_graph() {
    let mut graph = CompGraph::default();
    graph.add_node("scope/a@0.0.1".into());
    graph.add_node("scope/b@0.0.1".into());
    assert!(!has_duplicate_versions(&graph));
    graph.add_node("scope/a@0.0.2".into());
    assert!(has_duplicate_versions(&graph));
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
