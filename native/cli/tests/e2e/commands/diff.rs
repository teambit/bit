//! `e2e/commands/diff.e2e.ts`.

use crate::{
    helper::{Helper, Run, known, len, parse, strip_ansi},
    known_failure::{KnownResult, Native},
};

const BAR_FOO_V1: &str = "module.exports = function foo() { return 'got foo'; };\n";

const BAR_FOO_V2: &str = "module.exports = function foo() { return 'got foo v2'; };\n";

const BAR_FOO_V3: &str = "module.exports = function foo() { return 'got foo v3'; };\n";

const BAR_FOO_V4: &str = "module.exports = function foo() { return 'got foo v4'; };\n";

const NO_DIFF: &str = "no diff for";

const SUCCESS_DIFF: &str = "showing diff for";

/// `fixtures.isType`.
const IS_TYPE: &str = "module.exports = function isType() { return 'got is-type'; };";

/// `fixtures.isString`.
const IS_STRING: &str = "const isType = require('./is-type.js'); module.exports = function isString() { return isType() +  ' and got is-string'; };";

/// `command.diff(args)`: `bit diff <args>` when it runs natively, without colors.
fn diff(helper: &Helper, args: &str) -> KnownResult<String> {
    helper
        .native_output_or_known(&format!("diff {args}"))
        .map(|output| strip_ansi(&output))
}

/// `runWithTryCatch` / `expectToThrow`: stdout and stderr of a native run, whatever its
/// exit code.
fn diff_any(helper: &Helper, args: &str) -> KnownResult<String> {
    helper
        .native_or_known(&format!("diff {args}"))
        .map(|run| combined(&run))
}

fn combined(run: &Run) -> String {
    strip_ansi(&format!("{}{}", run.stdout, run.stderr))
}

fn has(output: &str, expected: &str) {
    assert!(output.contains(expected), "{expected:?} in:\n{output}");
}

fn lacks(output: &str, unexpected: &str) {
    assert!(!output.contains(unexpected), "{unexpected:?} not in:\n{output}");
}

/// `createComponentBarFoo(impl)` + `addComponentBarFoo()`.
fn bar_foo(helper: &Helper, implementation: &str) {
    helper.create_component_bar_foo(implementation);
    helper.add_component_bar_foo();
}

/// `getHead(id)`.
fn head(helper: &Helper, id: &str) -> String {
    let component = parse(&helper.run(&format!("cat-component {id} --json")));
    component["head"]
        .as_str()
        .unwrap()
        .to_string()
}

fn tagged() -> Helper {
    let helper = Helper::new();
    helper.re_init_workspace();
    bar_foo(&helper, BAR_FOO_V1);
    helper.run("tag --ver 0.0.5");
    helper
}

fn modified() -> Helper {
    let helper = tagged();
    helper.create_component_bar_foo(BAR_FOO_V2);
    helper
}

fn several_modified() -> Helper {
    let helper = Helper::new();
    helper.re_init_workspace();
    bar_foo(&helper, BAR_FOO_V1);
    helper.output_file("is-type/is-type.js", IS_TYPE);
    helper.run("add is-type -i utils/is-type");
    helper.output_file("is-string/is-string.js", "");
    helper.run("add is-string -i utils/is-string");
    helper.tag_without_build("", "");
    helper.create_component_bar_foo(BAR_FOO_V2);
    helper.append_file("is-type/is-type.js", "\n");
    helper
}

fn replaced_file() -> Helper {
    let helper = Helper::new();
    helper.re_init_workspace();
    bar_foo(&helper, BAR_FOO_V1);
    helper.tag_without_build("", "");
    helper.output_file("bar/foo2.js", BAR_FOO_V2);
    helper.delete_path("bar/foo.js");
    helper.run("add bar -i bar/foo -m bar/foo2.js");
    helper.run("status");
    helper
}

/// Files and fields between `from` and `to` after foo.js was replaced by foo2.js.
fn replaced_diff(output: &str, from: &str, to: &str) {
    has(output, &format!("--- foo.js ({from})"));
    has(output, &format!("+++ foo.js ({to})"));
    has(output, &format!("-{BAR_FOO_V1}"));
    has(output, &format!("--- foo2.js ({from})"));
    has(output, &format!("+++ foo2.js ({to})"));
    has(output, &format!("+{BAR_FOO_V2}"));
    has(output, &format!("--- Main File ({from})"));
    has(output, &format!("+++ Main File ({to})"));
    has(output, "- foo.js");
    has(output, "+ foo2.js");
    has(output, &format!("--- Files ({from})"));
    has(output, &format!("+++ Files ({to})"));
    has(output, "- [ foo.js ]");
    has(output, "+ [ foo2.js ]");
}

fn three_versions() -> Helper {
    let helper = Helper::new();
    helper.re_init_workspace();
    bar_foo(&helper, BAR_FOO_V1);
    helper.tag_component_bar_foo();
    helper.create_component_bar_foo(BAR_FOO_V2);
    helper.tag_component_bar_foo();
    helper.create_component_bar_foo(BAR_FOO_V3);
    helper.tag_component_bar_foo();
    helper
}

fn agent_flags() -> Helper {
    let helper = Helper::new();
    helper.re_init_workspace();
    bar_foo(&helper, BAR_FOO_V1);
    helper.output_file("is-type/is-type.js", IS_TYPE);
    helper.run("add is-type -i utils/is-type");
    helper.tag_without_build("", "");
    helper.create_component_bar_foo(BAR_FOO_V2);
    helper.output_file("is-type/extra.js", "module.exports = 'extra';\n");
    helper.run("add is-type -i utils/is-type -m is-type.js");
    helper
}

/// `/M foo\.js\s+\+\d+ -\d+/`.
fn has_stat_line(output: &str) -> bool {
    output
        .split("M foo.js")
        .skip(1)
        .any(|rest| {
            let Some(rest) = rest.trim_start().strip_prefix('+') else {
                return false;
            };
            let digits = rest
                .chars()
                .take_while(char::is_ascii_digit)
                .count();
            digits > 0
                && rest[digits..]
                    .strip_prefix(" -")
                    .is_some_and(|rest| rest.starts_with(|char: char| char.is_ascii_digit()))
        })
}

/// `bit diff bar/foo <flags>` as JSON, when it runs natively.
fn diff_json(flags: &str) -> KnownResult<serde_json::Value> {
    diff(&agent_flags(), &format!("bar/foo {flags}")).map(|output| parse(&output))
}

/// Two tags, then two snaps: the heads of the snaps.
fn with_snaps(helper: &Helper) -> (String, String) {
    helper.re_init_workspace();
    bar_foo(helper, BAR_FOO_V1);
    helper.tag_without_build("", "");
    helper.create_component_bar_foo(BAR_FOO_V2);
    helper.tag_without_build("", "");
    helper.create_component_bar_foo(BAR_FOO_V3);
    helper.run("snap");
    let first = head(helper, "bar/foo");
    helper.create_component_bar_foo(BAR_FOO_V4);
    helper.run("snap");
    (first, head(helper, "bar/foo"))
}

fn v3_to_v4(output: &str, from: &str, to: &str) {
    has(output, &format!("--- foo.js ({from})"));
    has(output, &format!("+++ foo.js ({to})"));
    has(output, "-module.exports = function foo() { return 'got foo v3'; };");
    has(output, "+module.exports = function foo() { return 'got foo v4'; };");
}

/// when there are no modified components › show an error saying that there are no
/// modified components
#[test]
fn no_modified_components() {
    let helper = Helper::new();
    helper.re_init_workspace();
    has(&diff_any(&helper, "").native(), "no modified components");
}

/// after the component was created › diff should show that all files were added
#[test]
fn a_new_component_shows_all_files_added() {
    let helper = Helper::new();
    helper.re_init_workspace();
    bar_foo(&helper, BAR_FOO_V1);
    let output = diff(&helper, "bar/foo").native();
    lacks(&output, NO_DIFF);
    has(&output, "+module.exports = function foo() { return 'got foo'; };");
}

/// after the component was created › after the component was tagged › should still
/// indicate that there is no diff for that component
#[test]
fn a_tagged_component_has_no_diff() {
    let output = diff(&tagged(), "bar/foo").native();
    has(&output, NO_DIFF);
    has(&output, "bar/foo");
}

/// after the component was tagged › and component was modified › should show a success
/// message; should indicate the original files with ---; should indicate the modified
/// files with +++; should show the deleted part with leading - (minus sign); should show
/// the added part with leading + (plus sign)
#[test]
fn a_modified_component_shows_its_diff() {
    let output = diff(&modified(), "bar/foo").native();
    has(&output, SUCCESS_DIFF);
    has(&output, "--- foo.js (0.0.5 original)");
    has(&output, "+++ foo.js (0.0.5 modified)");
    has(&output, "-module.exports = function foo() { return 'got foo'; };");
    has(&output, "+module.exports = function foo() { return 'got foo v2'; };");
}

/// and component was modified › should show a success message also when running from an
/// inner directory
#[test]
fn the_diff_runs_from_an_inner_directory() {
    let helper = modified();
    let run = Helper::cmd_in(&helper.scopes.local_path.join("bar"), "diff bar/foo");
    let run = known(run).native();
    assert!(run.status.success(), "{}", run.stderr);
    has(&strip_ansi(&run.stdout), SUCCESS_DIFF);
}

/// when there are several modified components and non modified components › running bit
/// diff with no ids › should show diff for all modified components; should not show non
/// modified components
#[test]
fn a_diff_without_ids_shows_the_modified_components() {
    let helper = several_modified();
    let remote = &helper.scopes.remote;
    let output = diff(&helper, "").native();
    has(&output, &format!("showing diff for {remote}/bar/foo"));
    has(&output, &format!("showing diff for {remote}/utils/is-type"));
    has(&output, BAR_FOO_V1);
    has(&output, BAR_FOO_V2);
    lacks(&output, &format!("showing diff for {remote}/utils/is-string"));
}

/// when a file is deleted and another is added › should indicate the deleted files as
/// deleted; should indicate the added files as added; other fields diff › should indicate
/// that the mainFile was changed; should indicate that the files array were changed
#[test]
fn a_replaced_file_is_deleted_and_added() {
    let output = diff(&replaced_file(), "bar/foo").native();
    replaced_diff(&output, "0.0.1 original", "0.0.1 modified");
}

/// running bit diff between the previous version and the last version › should indicate
/// the deleted files as deleted; should indicate the added files as added; other fields
/// diff › should indicate that the mainFile was changed; should indicate that the files
/// array were changed; should have the same output as running diff of the previous version
#[test]
fn a_diff_between_versions_shows_the_replaced_file() {
    let helper = replaced_file();
    helper.tag_without_build("", "");
    let output = diff(&helper, "bar/foo 0.0.1 0.0.2").native();
    replaced_diff(&output, "0.0.1", "0.0.2");
    assert_eq!(diff(&helper, "bar/foo 0.0.1").native(), output);
}

/// diff between an earlier version and current version › should show the earlier version
/// with leading - (minus sign); should show the current version with leading + (plus sign)
#[test]
fn a_diff_from_an_earlier_version() {
    let output = diff(&three_versions(), "bar/foo 0.0.1").native();
    has(&output, "--- foo.js (0.0.1)");
    has(&output, &format!("-{BAR_FOO_V1}"));
    has(&output, "+++ foo.js (0.0.3)");
    has(&output, &format!("+{BAR_FOO_V3}"));
}

/// diff between two different versions › should show the first version with leading -
/// (minus sign); should show the second version with leading + (plus sign)
#[test]
fn a_diff_between_two_versions() {
    let output = diff(&three_versions(), "bar/foo 0.0.1 0.0.2").native();
    has(&output, "--- foo.js (0.0.1)");
    has(&output, &format!("-{BAR_FOO_V1}"));
    has(&output, "+++ foo.js (0.0.2)");
    has(&output, &format!("+{BAR_FOO_V2}"));
}

/// ai-agent output flags › --name-only › should print the component header once; should
/// list changed files with a status letter and path; should not include the unified diff
/// body
#[test]
fn name_only_lists_the_changed_files() {
    let output = diff(&agent_flags(), "bar/foo --name-only").native();
    has(&output, SUCCESS_DIFF);
    has(&output, "bar/foo");
    assert!(
        output
            .lines()
            .any(|line| line == "M foo.js"),
        "{output}",
    );
    lacks(&output, "--- foo.js");
    lacks(&output, BAR_FOO_V2);
}

/// --stat › should include the changed file with +N -M counts; should not include the
/// unified diff body
#[test]
fn stat_counts_the_changed_lines() {
    let output = diff(&agent_flags(), "bar/foo --stat").native();
    assert!(has_stat_line(&output), "{output}");
    lacks(&output, "@@ ");
}

/// --file <path> › should include the matching file diff; should not include fields diff
/// (implies --files-only)
#[test]
fn file_shows_one_file_without_fields() {
    let output = diff(&agent_flags(), "utils/is-type --file extra.js").native();
    has(&output, "extra.js");
    lacks(&output, "--- Main File");
    lacks(&output, "--- Files");
}

/// --files-only › should include file diffs; should drop fields diff
#[test]
fn files_only_drops_the_fields() {
    let output = diff(&agent_flags(), "utils/is-type --files-only").native();
    has(&output, "extra.js");
    lacks(&output, "--- Files");
    lacks(&output, "--- Main File");
}

/// --configs-only › should include fields diff; should drop file-content diffs
#[test]
fn configs_only_drops_the_files() {
    let output = diff(&agent_flags(), "utils/is-type --configs-only").native();
    has(&output, "--- Files");
    lacks(&output, "@@ ");
}

/// --json › should return an array with one entry per matching component; should expose
/// id, hasDiff, filesDiff, fieldsDiff; should include diffOutput in each filesDiff entry by
/// default
#[test]
fn json_lists_the_component_diff() {
    let parsed = diff_json("--json").native();
    assert_eq!(len(&parsed), 1);
    assert!(parsed[0]["id"].is_string(), "{parsed}");
    assert!(parsed[0]["hasDiff"].is_boolean(), "{parsed}");
    assert!(parsed[0].get("filesDiff").is_some(), "{parsed}");
    assert!(parsed[0]["filesDiff"][0]["diffOutput"].is_string(), "{parsed}");
}

/// --json --name-only › should omit diffOutput from filesDiff entries
#[test]
fn json_name_only_omits_the_diff_output() {
    let parsed = diff_json("--json --name-only").native();
    let file = &parsed[0]["filesDiff"][0];
    assert!(file.get("filePath").is_some(), "{parsed}");
    assert!(file.get("status").is_some(), "{parsed}");
    assert!(file.get("diffOutput").is_none(), "{parsed}");
}

/// --json --stat › should include additions/deletions and omit diffOutput
#[test]
fn json_stat_counts_without_the_diff_output() {
    let parsed = diff_json("--json --stat").native();
    let file = &parsed[0]["filesDiff"][0];
    assert!(file["additions"].is_number(), "{parsed}");
    assert!(file["deletions"].is_number(), "{parsed}");
    assert!(file.get("diffOutput").is_none(), "{parsed}");
}

/// diff with --parent flag › when the version is a tag › should show the diff between the
/// tag and its parent tag; when the parent is a snap › should show the diff between the
/// snap and its parent snap; when no version is specified › should show the diff between
/// the current version and its parent
#[test]
fn parent_diffs_against_the_parent_version() {
    let helper = Helper::new();
    let (first, second) = with_snaps(&helper);
    let output = diff(&helper, "bar/foo 0.0.2 --parent").native();
    has(&output, "--- foo.js (0.0.1)");
    has(&output, "+++ foo.js (0.0.2)");
    has(&output, "-module.exports = function foo() { return 'got foo'; };");
    has(&output, "+module.exports = function foo() { return 'got foo v2'; };");
    let output = diff(&helper, &format!("bar/foo {second} --parent")).native();
    v3_to_v4(&output, &first, &second);
    let output = diff(&helper, "bar/foo --parent").native();
    v3_to_v4(&output, &first, &second);
}

/// diff with --parent flag › when the parent has identical content (e.g. a tag created on
/// top of a squashed merge-snap) › should skip identical ancestors and diff against the
/// first ancestor with different content; when the parent is a tag with identical content
/// (a legit tag with no changes) › should show no diff rather than walking further up the
/// history
#[test]
fn parent_skips_identical_snaps_but_not_tags() {
    let helper = Helper::new();
    let (first, _) = with_snaps(&helper);
    helper.run("tag --unmodified");
    let output = diff(&helper, "bar/foo 0.0.3 --parent").native();
    v3_to_v4(&output, &first, "0.0.3");
    helper.run("tag --unmodified");
    helper.run("tag --unmodified");
    let component = parse(&helper.run("cat-component bar/foo --json"));
    let versions = component["versions"].as_object().unwrap();
    let tag = versions.keys().next_back().unwrap();
    has(&diff(&helper, &format!("bar/foo {tag} --parent")).native(), NO_DIFF);
}

/// diff with --parent flag › when the only ancestor is a snap with identical content ›
/// should treat the version as having no parent and show all files as added
#[test]
fn parent_of_a_tag_over_an_identical_snap() {
    let helper = Helper::new();
    helper.re_init_workspace();
    helper.output_file("comp2/index.js", r#"console.log("hello");"#);
    helper.run("add comp2");
    helper.run("snap comp2");
    helper.run("tag comp2 --unmodified");
    let output = diff(&helper, "comp2 0.0.1 --parent").native();
    lacks(&output, NO_DIFF);
    has(&output, "--- index.js (no parent)");
    has(&output, "+++ index.js (0.0.1)");
    has(&output, r#"+console.log("hello");"#);
}

/// What native `bit diff` still leaves to the Node.js CLI: several ids or a pattern
/// matching none, a version the local scope lacks, a configured git executable,
/// mutually exclusive flags, two versions with `--parent`, and a soft-deleted component.
mod known_failures {
    use super::{
        IS_STRING, NO_DIFF, agent_flags, combined, diff, diff_any, has, lacks, modified,
        several_modified, three_versions, with_snaps,
    };
    use crate::{
        allow_known_failure,
        helper::{Helper, known},
    };

    /// for non existing component › show an error saying the component was not found
    #[test]
    fn a_missing_component_is_not_found() {
        let helper = Helper::new();
        helper.re_init_workspace();
        let output = allow_known_failure!(diff_any(&helper, "utils/non-exist"));
        has(
            &output,
            r#"error: component "utils/non-exist" was not found on your local workspace."#,
        );
    }

    /// when git path is configured incorrectly › should throw an error `GitNotFound`
    #[test]
    fn a_wrong_git_path_fails() {
        let helper = modified();
        let globals = helper.own_global_config("git_path", "/non/exist/location");
        let env = [("BIT_GLOBALS_DIR", globals.as_os_str())];
        let run = Helper::cmd_in_with(&helper.scopes.local_path, "diff bar/foo", &env);
        let output = combined(&allow_known_failure!(known(run)));
        has(&output, "unable to run command because git executable not found");
    }

    /// running bit diff with multiple ids › should not show diff for non modified components;
    /// should mention the components with no diff
    #[test]
    fn a_diff_of_several_ids_mentions_the_unmodified() {
        let helper = several_modified();
        let ids = r#""**/utils/is-type, **/utils/is-string""#;
        let output = allow_known_failure!(diff(&helper, ids));
        lacks(&output, IS_STRING);
        has(&output, "utils/is-string");
        has(&output, NO_DIFF);
    }

    /// component with multiple versions › diff between a non-exist version and current
    /// version › should throw an `VersionNotFound` error
    #[test]
    fn a_missing_version_is_not_found() {
        let helper = three_versions();
        let output = allow_known_failure!(diff_any(&helper, "bar/foo 1.0.6"));
        let remote = &helper.scopes.remote;
        let error =
            format!(r#"error: version "1.0.6" of component {remote}/bar/foo was not found."#);
        has(&output, &error);
    }

    /// mutually exclusive flags › --files-only + --configs-only should error; --name-only +
    /// --stat should error; --configs-only + --file should error
    #[test]
    fn exclusive_flags_fail() {
        let helper = agent_flags();
        let flags =
            ["--files-only --configs-only", "--name-only --stat", "--configs-only --file foo.js"];
        for flags in flags {
            let output = allow_known_failure!(diff_any(&helper, &format!("bar/foo {flags}")));
            has(&output, "mutually exclusive");
        }
    }

    /// diff with --parent flag › when the version is the first version › should show all files
    /// as added; when two versions are specified along with --parent › should throw an error
    #[test]
    fn parent_of_the_first_version_adds_everything() {
        let helper = Helper::new();
        with_snaps(&helper);
        let output = allow_known_failure!(diff(&helper, "bar/foo 0.0.1 --parent"));
        lacks(&output, NO_DIFF);
        has(&output, "--- foo.js (no parent)");
        has(&output, "+++ foo.js (0.0.1)");
        has(&output, "+module.exports = function foo() { return 'got foo'; };");
        lacks(&output, "-module.exports");
        let output = allow_known_failure!(diff_any(&helper, "bar/foo 0.0.1 0.0.2 --parent"));
        has(&output, "--parent flag expects to get only one version");
    }

    /// diff with --parent flag › when the component is soft-deleted in the workspace › should
    /// still compare the stored versions rather than showing the files as deleted
    #[test]
    fn parent_of_a_soft_deleted_component() {
        let helper = Helper::new();
        with_snaps(&helper);
        for _ in 0..3 {
            helper.run("tag --unmodified");
        }
        helper.run("delete bar/foo --silent");
        let output = allow_known_failure!(diff(&helper, "--parent"));
        lacks(&output, "-module.exports = function foo() { return 'got foo v4'; };");
        has(&output, NO_DIFF);
    }
}
