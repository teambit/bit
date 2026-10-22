use super::{Options, parse_options};

#[test]
fn parses_link_options() {
    assert_eq!(
        parse_options(&[
            "comp1",
            "-j",
            "--verbose",
            "-r",
            "--target",
            "dist",
            "--skip-fetching-objects",
            "--peers",
            "--comp-summary",
        ]),
        Some(Options {
            ids: vec!["comp1".into()],
            json: true,
            verbose: true,
            rewire: true,
            target: Some("dist".into()),
            skip_fetching_objects: true,
            peers: true,
            comp_summary: true,
        }),
    );
}
