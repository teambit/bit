use super::{Options, find_cycles, parse_options, render};
use crate::commands::graph_cmd::model::CompGraph;
use serde_json::json;

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
    assert_eq!(
        parse_options(&[]),
        Some(Options {
            list: false,
            json: false,
            include_deps: false,
            names: vec!["circular".into(), "duplicate dependencies".into()],
        }),
    );
    assert_eq!(
        parse_options(&["circular"]),
        Some(Options {
            list: false,
            json: false,
            include_deps: false,
            names: vec!["circular".into()],
        }),
    );
    assert_eq!(
        parse_options(&["--list", "circular"]),
        Some(Options {
            list: true,
            json: false,
            include_deps: false,
            names: vec!["circular".into()],
        }),
    );
    assert_eq!(parse_options(&["--no-list"]), None);
    assert_eq!(parse_options(&["--no-json"]), None);
    assert_eq!(parse_options(&["--no-include-deps"]), None);
    assert_eq!(
        parse_options(&["circular", "--no-color"]),
        Some(Options {
            list: false,
            json: false,
            include_deps: false,
            names: vec!["circular".into()],
        }),
    );
}

#[test]
fn formats_duplicate_version_nodes_in_graph() {
    let mut graph = CompGraph::default();
    graph.add_node("scope/a@0.0.3".into());
    graph.add_node("scope/b@0.0.1".into());
    let seeders = vec!["scope/a@0.0.3".into(), "scope/b@0.0.1".into()];
    let (msg, rendered, data) = render::duplicate_dependencies(&graph, &seeders).unwrap();
    assert_eq!(msg, "Found 0 duplicate dependencies.");
    assert_eq!(rendered, "");
    assert_eq!(data, json!([]));

    graph.add_edge("scope/b@0.0.1".into(), "scope/a@0.0.1".into(), "prod");
    graph.add_edge("scope/c@0.0.1".into(), "scope/a@0.0.2".into(), "prod");
    let (msg, rendered, data) = render::duplicate_dependencies(&graph, &seeders).unwrap();
    assert_eq!(msg, "Found 1 duplicate dependency.");
    assert!(rendered.contains("- scope/a has 3 versions (latest is scope/a@0.0.3)"));
    assert_eq!(
        data,
        json!([{
            "compId": "scope/a",
            "latestVersion": "scope/a@0.0.3",
            "outdated": [
                { "version": "scope/a@0.0.2", "dependents": ["scope/c@0.0.1"] },
                { "version": "scope/a@0.0.1", "dependents": ["scope/b@0.0.1"] },
            ],
        }]),
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
