//! Read-only component-pattern and state-selector parity for native diff.

use crate::helper::{FOO_FIXTURE, Helper, parse};
use std::ffi::OsStr;

fn workspace() -> Helper {
    let helper = Helper::new();
    helper.re_init_workspace();
    helper.create_component_bar_foo(FOO_FIXTURE);
    helper.add_component_bar_foo();
    helper.tag_component_bar_foo();
    helper.output_file("baz/card.js", FOO_FIXTURE);
    helper.run("add baz -i baz/card");
    helper.append_file("bar/foo.js", "\n// changed");
    helper
}

fn parity(helper: &Helper, pattern: &str) {
    let command = format!(r#"diff "{pattern}" --json"#);
    let copy = helper.clone_workspace();
    let native = helper.native_run(&command);
    helper.get_cloned_workspace(&copy);
    let node = Helper::cmd_in_with(
        &helper.scopes.local_path,
        &command,
        &[("BIT_NATIVE", OsStr::new("off"))],
    );
    assert_eq!(native.status.code(), node.status.code(), "{command}");
    assert_eq!(native.stderr, node.stderr, "{command}");
    assert_eq!(parse(&native.stdout), parse(&node.stdout), "{command}");
}

/// Component patterns preserve minimatch classes, extglobs and ordered
/// negation without changing the grammar of native write commands.
#[test]
fn advanced_component_globs_match_native_diff() {
    let helper = workspace();
    helper.output_file("extra/card2.js", FOO_FIXTURE);
    helper.run("add extra -i baz/card2");
    for pattern in
        ["**/[fc]*", "**/+(foo|card)", "**, !**/foo, **/foo", "**/card{1..3}", "**/!(foo)*"]
    {
        parity(&helper, pattern);
    }
}

/// State selectors use current content/metadata and union or intersect in
/// the same order as workspace filterIdsFromPoolIdsByPattern.
#[test]
fn modified_new_and_environment_selectors_match_diff() {
    let helper = workspace();
    for pattern in [
        "$new",
        "$modified",
        "$codeModified",
        "$modified AND **/bar/*",
        "$env:teambit.harmony/node AND **",
        "$new, **/bar/*",
    ] {
        parity(&helper, pattern);
    }
}

/// Local-only and pending soft tags come from the bitmap state.
#[test]
fn bitmap_and_snapshot_selectors_match_diff() {
    let helper = workspace();
    helper.run("tag bar/foo --soft");
    parity(&helper, "$softTagged");
    helper.run("local-only set baz/card");
    parity(&helper, "$localOnly");
}

fn text_parity(helper: &Helper, pattern: &str, ci: bool) {
    let command = format!(r#"diff "{pattern}" --name-only"#);
    let baseline = helper.clone_workspace();
    let variables = if ci { vec![("CI", OsStr::new("1"))] } else { Vec::new() };
    let mut node_variables = variables.clone();
    node_variables.push(("BIT_NATIVE", OsStr::new("off")));
    let actual = Helper::cmd_in_with(&helper.scopes.local_path, &command, &variables);
    let expected = Helper::cmd_in_with(&baseline, &command, &node_variables);
    assert!(actual.native, "{}", actual.trace);
    assert_eq!(actual.status.code(), expected.status.code());
    assert_eq!(actual.stderr, expected.stderr);
    assert_eq!(actual.stdout, expected.stdout, "{command}, ci={ci}");
}

/// Ordinary and CI text output include the state-filter loading sequence.
#[test]
fn state_selector_text_matches_native_diff_progress() {
    let helper = workspace();
    for pattern in ["$modified", "$new", "$env:teambit.harmony/node AND **"] {
        text_parity(&helper, pattern, false);
        text_parity(&helper, pattern, true);
    }
}

/// Model deprecation, pending internalization and untagged main heads use
/// the same state predicates as workspace Filter.
#[test]
fn model_and_internal_state_selectors_match_diff() {
    let helper = workspace();
    helper.run("snap bar/foo --skip-auto-snap");
    parity(&helper, "$snappedOnMain");
    helper.run("internalize bar/foo");
    parity(&helper, "$internal");
    helper.run("deprecate bar/foo");
    helper.tag_without_build("bar/foo", "");
    parity(&helper, "$deprecated");
}

/// Locally removed components are absent from the listIds state-selector
/// pool, so the canonical no-match error runs before any native writes.
#[test]
fn locally_removed_components_are_not_deleted_selector_matches() {
    let helper = workspace();
    helper.run("delete bar/foo --silent");
    let output = helper.cmd(r#"diff "$deleted" --json"#);
    assert!(!output.native, "{}", output.trace);
    assert_eq!(output.status.code(), Some(1));
}

/// Imported removed Versions remain selectable even though locally removed
/// bitmap rows are excluded from the same selector pool.
#[test]
fn deleted_state_selector_matches_diff() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(2, true, "");
    helper.tag_without_build("", "");
    crate::helper::remote::publish(&helper);
    helper.run("delete comp2 --silent");
    helper.output_file("comp1/index.js", "");
    helper.tag_without_build("", "");
    crate::helper::remote::publish(&helper);
    helper.re_init_workspace();
    helper.add_remote_scope();
    helper.run(&format!("import {}/comp2 -x", helper.scopes.remote));
    parity(&helper, "$deleted");
    text_parity(&helper, "$deleted", false);
    text_parity(&helper, "$deleted", true);
}

/// Node rejects literal version suffixes rather than interpreting them as
/// positional diff revisions; native selection preserves that canonical error.
#[test]
fn inline_component_version_preserves_canonical_error() {
    let helper = workspace();
    helper.tag_without_build("bar/foo", "");
    helper.append_file("bar/foo.js", "\n// third");
    let command = format!("diff {}/bar/foo@0.0.1 --json", helper.scopes.remote);
    let copy = helper.clone_workspace();
    let native = helper.cmd(&command);
    assert!(!native.native, "{}", native.trace);
    helper.get_cloned_workspace(&copy);
    let node = Helper::cmd_in_with(
        &helper.scopes.local_path,
        &command,
        &[("BIT_NATIVE", OsStr::new("off"))],
    );
    assert_eq!(native.status.code(), Some(1));
    assert_eq!(native.stdout, node.stdout);
    assert_eq!(native.stderr, node.stderr);
}
