use super::{Options, fast_graph_error, parse_options};

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
}
