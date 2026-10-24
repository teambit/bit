use super::{
    Options,
    format::{BoundLink, ComponentLinkItem, LinkSummary, render_json, render_report},
    parse_options,
    rewire::{CodemodResult, replace_package_name},
    target::{LinkDetail, LinkToDirResult},
};
use crate::commands::{color::Chalk, workspace_command::format::Formatter};

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
    assert_eq!(
        parse_options(&["-v", "--target=out"]),
        Some(Options {
            ids: Vec::new(),
            json: false,
            verbose: true,
            rewire: false,
            target: Some("out".into()),
            skip_fetching_objects: false,
            peers: false,
            comp_summary: false,
        }),
    );
}

#[test]
fn replaces_package_names_in_imports_and_requires() {
    let source = "const a = require('../comp2');\nimport b from \"../comp2/sub\";\n";
    let rewired = replace_package_name(source, "../comp2", "@my-scope/comp2");
    assert_eq!(
        rewired,
        "const a = require('@my-scope/comp2');\nimport b from \"@my-scope/comp2/sub\";\n",
    );
}

#[test]
fn renders_report_and_json() {
    let summary = LinkSummary {
        workspace_name: "my-ws".into(),
        component_links: vec![ComponentLinkItem {
            id: "my-scope/comp1".into(),
            package_name: "@my-scope/comp1".into(),
            bound: vec![BoundLink {
                from: "comp1/index.js".into(),
                to: "node_modules/@my-scope/comp1/index.js".into(),
                exists_before: false,
            }],
        }],
        codemod_results: vec![CodemodResult {
            id: "my-scope/comp1".into(),
            changed_files: vec!["index.js".into()],
        }],
        target_links: vec![LinkToDirResult {
            component_id: "my-scope/comp1".into(),
            links_detail: LinkDetail {
                package_name: "@my-scope/comp1".into(),
                from: "/ws/node_modules/@my-scope/comp1".into(),
                to: "/target/node_modules/@my-scope/comp1".into(),
            },
        }],
    };
    let formatter = Formatter::new(Chalk::new(false));
    let report = render_report(&formatter, &summary, &Options::default());
    assert!(report.contains("Linked 1 components and 0 core aspects"));
    assert!(report.contains("rewired 1 components and total of 1 files"));
    assert!(report.contains("Target Links"));

    let json_val = render_json(&summary);
    assert_eq!(json_val["legacyLinkResults"][0]["id"], "my-scope/comp1");
    assert_eq!(json_val["linkToDirResults"][0]["componentId"], "my-scope/comp1");
}
