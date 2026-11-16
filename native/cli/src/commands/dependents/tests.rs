//! Unit tests for `bit dependents` [`parse_options`], [`is_unscoped_bitmap_row`], and [`render_dependents_report`].
//!
//! Verifies [`Options`], [`DepGraph`], [`DependentInfo`], and [`Chalk`]-formatted report rendering across [`render_dependents_report`].

use super::{
    Options, is_unscoped_bitmap_row, parse_options,
    render::{DepGraph, DependentInfo, render_dependents_report},
};
use crate::commands::color::Chalk;
use serde_json::json;

/// Verifies [`parse_options`] into [`Options`] for `bit dependents` CLI flags and [`is_unscoped_bitmap_row`] unscoped `.bitmap` row detection.
#[test]
fn parses_dependents_options_and_checks_bitmap_scope() {
    assert_eq!(parse_options(&["comp1"]), Some(Options { id: "comp1".into(), json: false }));
    assert_eq!(
        parse_options(&["my-scope/comp1", "-j", "--no-color", "--no-color=false"]),
        Some(Options { id: "my-scope/comp1".into(), json: true }),
    );
    assert_eq!(
        parse_options(&["my-scope/comp1", "--json=true"]),
        Some(Options { id: "my-scope/comp1".into(), json: true }),
    );
    assert_eq!(
        parse_options(&["my-scope/comp1", "-j", "--json=false"]),
        Some(Options { id: "my-scope/comp1".into(), json: false }),
    );
    assert_eq!(parse_options(&[]), None);
    assert_eq!(parse_options(&[""]), None);
    assert!(is_unscoped_bitmap_row(&json!({ "scope": "", "version": "" })));
    assert!(is_unscoped_bitmap_row(&json!({ "rootDir": "comp1" })));
    assert!(!is_unscoped_bitmap_row(&json!({ "scope": "my-scope", "version": "0.0.1" })));
}

/// Verifies [`DepGraph::dependents_of`] and [`render_dependents_report`] for transitive dependents.
#[test]
fn computes_transitive_dependents_and_formats_report() {
    let mut graph = DepGraph::default();
    graph.add_edge("my-scope/comp1@0.0.1", "my-scope/comp2@0.0.1", "prod");
    graph.add_edge("my-scope/comp2@0.0.1", "my-scope/comp3@0.0.1", "prod");

    let deps = graph.dependents_of("my-scope/comp3@0.0.1");
    assert_eq!(
        deps,
        vec![
            DependentInfo {
                id: "my-scope/comp2@0.0.1".into(),
                depth: 1,
                parent: "my-scope/comp3@0.0.1".into(),
                dependency_type: "prod".into(),
            },
            DependentInfo {
                id: "my-scope/comp1@0.0.1".into(),
                depth: 2,
                parent: "my-scope/comp2@0.0.1".into(),
                dependency_type: "prod".into(),
            },
        ],
    );

    let chalk = Chalk::new(false);
    let report =
        render_dependents_report("my-scope/comp3@0.0.1", "my-scope/comp3", &deps, &[], chalk);
    assert!(report.contains("Dependents originated from workspace"));
    assert!(report.contains("<self>"));
    assert!(report.contains("my-scope/comp1@0.0.1"));

    let empty = render_dependents_report("my-scope/comp3@0.0.1", "my-scope/comp3", &[], &[], chalk);
    assert!(empty.contains("no dependents found for my-scope/comp3@0.0.1"));
}

/// Verifies [`DepGraph::dependents_of`] returns an empty vector on an empty [`DepGraph`].
///
/// Ensures querying an unknown component ID does not panic or fabricate edges.
#[test]
fn empty_dependency_graph_returns_no_dependents_for_any_id() {
    let graph = DepGraph::default();
    assert!(graph.dependents_of("my-scope/comp1@0.0.1").is_empty());
}
