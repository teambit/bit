//! End-to-end port of `e2e/commands/search.e2e.ts` for native `bit search` local and JSON parity ([`setup_workspace`]).
//!
//! Tests keyword matching, non-matching queries, and `--json` output under `--local-only` via [`Helper`] and [`parse`].

use crate::helper::{FOO_FIXTURE, Helper, parse};

/// Initializes a workspace with tagged `bar/foo` ([`FOO_FIXTURE`]) and `utils/is-type` components for search tests.
fn setup_workspace(helper: &Helper) {
    helper.re_init_workspace();
    helper.create_component_bar_foo(FOO_FIXTURE);
    helper.add_component_bar_foo();
    helper.run("tag bar/foo");
    helper.output_file("is-type/is-type.js", "module.exports = () => true;");
    helper.run("add is-type -i utils/is-type");
    helper.run("tag utils/is-type");
}

/// Verifies `bit search foo --local-only` finds `bar/foo` by matching keyword in [`setup_workspace`] via [`Helper::native`].
#[test]
fn should_find_a_component_by_matching_keyword() {
    let helper = Helper::new();
    setup_workspace(&helper);
    let output = helper.native("search foo --local-only");
    assert!(output.contains("bar/foo"), "{output}");
}

/// Verifies `bit search nonexistent --local-only` reports `no matches in workspace` in [`setup_workspace`].
/// bit search command › local search with components in workspace › should not find components that do not match
#[test]
fn should_not_find_components_that_do_not_match() {
    let helper = Helper::new();
    setup_workspace(&helper);
    let output = helper.native("search nonexistent --local-only");
    assert!(output.contains("no matches in workspace"), "{output}");
}

/// bit search command › local search with components in workspace › should match case-insensitively
#[test]
fn should_match_case_insensitively() {
    let helper = Helper::new();
    setup_workspace(&helper);
    let output = helper.native("search FOO --local-only");
    assert!(output.contains("bar/foo"), "{output}");
}

/// bit search command › local search with components in workspace › should union and deduplicate results across multiple queries
#[test]
fn should_union_and_deduplicate_results_across_multiple_queries() {
    let helper = Helper::new();
    setup_workspace(&helper);
    let output = helper.native("search foo bar is-type --local-only --json");
    let results = parse(&output);
    let local = results["local"].as_array().unwrap();
    let foo_count = local
        .iter()
        .filter(|id| id.as_str().unwrap().contains("bar/foo"))
        .count();
    assert_eq!(foo_count, 1);
    assert!(
        local
            .iter()
            .any(|id| id.as_str().unwrap().contains("is-type")),
    );
}

/// bit search command › local search with components in workspace › should return json output with --json flag
#[test]
fn should_return_json_output_with_json_flag() {
    let helper = Helper::new();
    setup_workspace(&helper);
    let output = helper.native("search foo --local-only --json");
    let results = parse(&output);
    assert!(results.get("local").is_some());
    assert!(results.get("remote").is_some());
    assert!(results.get("perQuery").is_some());
    assert_eq!(results["hasWorkspace"], true);
    let local = results["local"].as_array().unwrap();
    assert!(
        local
            .iter()
            .any(|id| id.as_str().unwrap().contains("bar/foo")),
    );
}
