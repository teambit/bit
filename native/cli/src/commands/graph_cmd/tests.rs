use super::{
    Options, fast_graph_error,
    model::{CompGraph, GraphEdge},
    parse_options,
};

#[test]
fn parses_graph_options_and_validates_remote_or_host() {
    let opts = parse_options(&["comp1", "--cycles", "--layout", "dot", "-j"]).unwrap();
    assert_eq!(
        opts,
        Options {
            id: Some("comp1".into()),
            remote: None,
            layout: Some("dot".into()),
            png: false,
            cycles: true,
            include_local_only: false,
            include_dependencies: false,
            json: true,
        },
    );

    let temp = tempfile::tempdir().unwrap();
    assert_eq!(fast_graph_error(temp.path(), &opts), Some("Host was not found"));

    let empty_remote = parse_options(&["--remote"]).unwrap();
    assert_eq!(
        fast_graph_error(temp.path(), &empty_remote),
        Some("please specify remote scope name or enter an id"),
    );
    assert_eq!(parse_options(&["--layout=-bad"]), None);
    assert!(parse_options(&["--cycles=true", "--json=false"]).unwrap().cycles);
    let jr = parse_options(&["-jr", "my-remote"]).unwrap();
    assert_eq!(jr.remote.as_deref(), Some("my-remote"));
    assert!(jr.json);
}

#[test]
fn filters_graph_seeders_local_only_and_cycles() {
    let mut graph = CompGraph::default();
    graph.add_edge("scope/a@0.0.1".into(), "scope/b@0.0.1".into(), "prod");
    graph.add_edge("scope/b@0.0.1".into(), "scope/c@0.0.1".into(), "prod");
    graph.add_edge("scope/b@0.0.1".into(), "scope/a@0.0.1".into(), "dev");
    graph.sort_deterministic();

    assert_eq!(graph.nodes, vec!["scope/a@0.0.1", "scope/b@0.0.1", "scope/c@0.0.1"]);
    assert_eq!(graph.edges.len(), 3);

    let mut cyclic = graph.clone();
    cyclic.filter_cycles();
    cyclic.sort_deterministic();
    assert_eq!(cyclic.nodes, vec!["scope/a@0.0.1", "scope/b@0.0.1"]);
    assert_eq!(
        cyclic.edges,
        vec![
            GraphEdge {
                id: "scope/a@0.0.1->scope/b@0.0.1".into(),
                source_id: "scope/a@0.0.1".into(),
                target_id: "scope/b@0.0.1".into(),
                attr: "prod".into(),
                bidirectional: false,
            },
            GraphEdge {
                id: "scope/b@0.0.1->scope/a@0.0.1".into(),
                source_id: "scope/b@0.0.1".into(),
                target_id: "scope/a@0.0.1".into(),
                attr: "dev".into(),
                bidirectional: false,
            },
        ],
    );
}
