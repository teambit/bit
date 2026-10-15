use super::{Flags, parse, report};
use crate::commands::{color::Chalk, test_support::expected_success_symbols};
use serde_json::{Value, json};

#[test]
fn parses_the_report_flags() {
    assert_eq!(parse(&[]), Some(Flags::default()));
    assert_eq!(
        parse(&["-w", "--verbose", "--strict", "--fail-on-error", "--expand"]),
        Some(Flags {
            verbose: true,
            warnings: true,
            strict: true,
            fail_on_error: true,
            expand: true
        }),
    );
    for args in [&["-c"][..], &["--quick"], &["--lanes"], &["-w", "--warnings"], &["-j", "-w"]] {
        assert_eq!(parse(args), None, "{args:?}");
    }
}

fn result(fields: &Value) -> Value {
    let mut result = json!({"currentLaneId": "remote/main", "forkedLaneId": null});
    for field in [
        "newComponents",
        "modifiedComponents",
        "stagedComponents",
        "unavailableOnMain",
        "componentsWithIssues",
        "importPendingComponents",
        "autoTagPendingComponents",
        "invalidComponents",
        "locallySoftRemoved",
        "remotelySoftRemoved",
        "outdatedComponents",
        "mergePendingComponents",
        "componentsDuringMergeState",
        "softTaggedComponents",
        "snappedComponents",
        "localOnly",
        "pendingUpdatesFromMain",
        "updatesFromForked",
        "workspaceIssues",
        "pendingUpdateDependents",
    ] {
        result[field] = fields
            .get(field)
            .cloned()
            .unwrap_or_else(|| json!([]));
    }
    result
}

fn context() -> Value {
    json!({
        "targets": [
            {"identity": "remote/one", "version": "0.0.1"},
            {"identity": "remote/two", "version": ""},
        ],
        "models": [{"scope": "remote", "name": "one", "head": "a".repeat(40)}],
        "histories": [{"identity": "remote/one", "merge": {"sourceOnly": ["x"], "targetOnly": ["y", "z"]}}],
    })
}

#[test]
fn reports_a_clean_workspace() {
    let output =
        report(&result(&json!({})), &context(), &Flags::default(), Chalk::new(false)).unwrap();
    assert_eq!(
        output.data,
        expected_success_symbols(
            "\u{2714} nothing to tag or export (use \"bit create <template> <component>\" to generate a new component)"
        ),
    );
    assert_eq!(output.code, 0);
}

#[test]
fn reports_the_current_lane_after_status_sections() {
    let mut lane = result(&json!({
        "stagedComponents": [{"id": "remote/one", "versions": ["b".repeat(40)]}],
    }));
    lane["currentLaneId"] = json!("remote/study");
    let output = report(&lane, &context(), &Flags::default(), Chalk::new(false)).unwrap();
    assert_eq!(
        output.data,
        "staged components (1)\n  (use \"bit export\" to push these component versions to the remote scope)\n   › remote/one - 1 snap(s)\n\ncurrent lane remote/study",
    );
}

#[test]
fn reports_a_clean_lane() {
    let mut lane = result(&json!({}));
    lane["currentLaneId"] = json!("remote/study");
    let output = report(&lane, &context(), &Flags::default(), Chalk::new(false)).unwrap();
    assert_eq!(
        output.data,
        expected_success_symbols(
            "✔ nothing to tag or export (use \"bit create <template> <component>\" to generate a new component)\n\ncurrent lane remote/study"
        ),
    );
}

#[test]
fn reports_issues_staged_versions_and_merges() {
    let issues = json!([{"id": "remote/two", "issues": [
        {"type": "MissingManuallyConfiguredPackages", "description": "missing packages", "solution": r#"run "bit install""#, "isTagBlocker": true, "dataAsString": "          a, b"},
        {"type": "MissingDists", "description": "missing dists", "solution": r#"run "bit compile""#, "isTagBlocker": false, "dataAsString": ""},
    ]}]);
    let fields = json!({
        "newComponents": ["remote/two"],
        "stagedComponents": [{"id": "remote/one", "versions": ["0.0.1", "b".repeat(40)]}],
        "mergePendingComponents": ["remote/one"],
        "componentsWithIssues": issues,
    });
    let flags = Flags { fail_on_error: true, ..Flags::default() };
    let output = report(&result(&fields), &context(), &flags, Chalk::new(false)).unwrap();
    let expected = "pending merge (1)
  (use \"bit reset\" to discard local tags/snaps, and bit checkout head to re-merge with the remote.
  alternatively, to keep local tags/snaps history, use \"bit merge [component-id]\")
   \u{26A0} remote/one local and remote have diverged and have 1 (source) and 2 (target) uncommon snaps respectively

new components (1)
  (use \"bit snap/tag\" to lock a version with all your changes)
   \u{2716} remote/two ... issues found

staged components (1)
  (use \"bit export\" to push these component versions to the remote scope)
   \u{203A} remote/one - versions: 0.0.1, 1 snap(s)

components with issues (1)
  (fix the issues according to the suggested solution)
   \u{2716} remote/two ... issues found       
       missing packages  (run \"bit install\"): 
          a, b
       missing dists  (run \"bit compile\") 


learn more about Bit components: https://bit.dev/reference/components/component-anatomy";
    assert_eq!(output.data, expected);
    assert_eq!(output.code, 1);
}

#[test]
fn collapses_auto_tag_pending_components() {
    let fields =
        json!({"modifiedComponents": ["remote/two"], "autoTagPendingComponents": ["remote/one"]});
    let output =
        report(&result(&fields), &context(), &Flags::default(), Chalk::new(false)).unwrap();
    assert!(output.data.ends_with(
        "components pending auto-tag (1)\n  (these will be auto-tagged when their modified dependencies are tagged)\n   remote (1)  \u{2014} use --expand to list",
    ));
    let expand = Flags { expand: true, ..Flags::default() };
    let output = report(&result(&fields), &context(), &expand, Chalk::new(false)).unwrap();
    assert!(output.data.ends_with("   \u{203A} remote/one"));
}

#[test]
fn declines_sections_left_to_node() {
    let fields = json!({"pendingUpdatesFromMain": ["remote/one"]});
    assert!(report(&result(&fields), &context(), &Flags::default(), Chalk::new(false)).is_err());
}
