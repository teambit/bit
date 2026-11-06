//! Unit tests for `bit mini-status` ([`report`]) and `bit status --quick` ([`quick_report`]) [`Summary`] terminal formatting.
//!
//! Verifies modified/new component lists, issue counts, and [`expected_success_symbols`] with [`Chalk`] across [`report`] and [`quick_report`].

use super::{Summary, quick_report, report};
use crate::commands::{color::Chalk, test_support::expected_success_symbols};

/// Builds a [`Summary`] fixture with `modified` and `new_comps` component lists.
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

/// Verifies [`report`] and [`quick_report`] formatting with [`Chalk`] when modified [`summary`] components exist.
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

/// Verifies that [`quick_report`] formats the clean-workspace message when no components are modified or new.
#[test]
fn reports_a_workspace_without_file_changes() {
    assert_eq!(
        quick_report(&summary(&[], &[]), Chalk::new(false)),
        expected_success_symbols(
            "\u{2714} no new or modified components (based on file changes only, use \"bit status\" for full check)"
        ),
    );
}

/// Verifies that [`report`] lists new components under `new components:` when no modified components exist.
///
/// Confirms `modified components (files only):` renders `<none>` above the new component list.
#[test]
fn mini_status_report_lists_new_components_when_present() {
    let only_new = summary(&[], &["s/new-comp"]);
    assert_eq!(
        report(&only_new, Chalk::new(false)),
        "modified components (files only):\n<none>\n\nnew components:\ns/new-comp",
    );
}
