use super::{Summary, quick_report, report};
use crate::commands::{color::Chalk, test_support::expected_success_symbols};

fn summary(modified: &[&str], new_comps: &[&str]) -> Summary {
    Summary {
        modified: modified
            .iter()
            .map(ToString::to_string)
            .collect(),
        new_comps: new_comps
            .iter()
            .map(ToString::to_string)
            .collect(),
        comp_with_issues: Vec::new(),
    }
}

#[test]
fn reports_the_file_changes() {
    let changed = summary(&["s/a", "s/b"], &[]);
    assert_eq!(
        report(&changed, Chalk::new(false)),
        "modified components (files only):\ns/a\ns/b\n\nnew components:\n<none>",
    );
    assert_eq!(
        quick_report(&changed, Chalk::new(false)),
        "modified components (files only) (2)\n   \u{203A} s/a\n   \u{203A} s/b",
    );
}

#[test]
fn reports_a_workspace_without_file_changes() {
    assert_eq!(
        quick_report(&summary(&[], &[]), Chalk::new(false)),
        expected_success_symbols(
            "\u{2714} no new or modified components (based on file changes only, use \"bit status\" for full check)"
        ),
    );
}
