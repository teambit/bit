//! Pending-directory probes ([`normalize`]) append same-category answers in asynchronous completion order.
//!
//! Provides deterministic output normalization for two-scope asynchronous `bit resume-export` probes via [`normalize`].

/// Canonicalizes the two-scope `pending objects to delete (2)` probe permutation in `output` for `mixed_scope` tested by [`only_the_complete_two_scope_probe_permutation_is_normalized`].
pub(super) fn normalize(output: &str, mixed_scope: Option<&str>) -> String {
    let Some(scope) = mixed_scope else { return output.to_owned() };
    let heading = "  pending objects to delete (2)\n  (of the export-id \"fixture-export\")\n";
    let canonical = format!("{heading}   › {scope}\n   › fixture.http\n");
    let reverse = format!("{heading}   › fixture.http\n   › {scope}\n");
    output.replace(&reverse, &canonical)
}

/// Verifies [`normalize`] reorders only the exact two-scope `pending objects to delete (2)` probe block and preserves altered strings.
///
/// Ensures modified headings, missing scope lines, or trailing text are not normalized by [`normalize`].
#[test]
fn only_the_complete_two_scope_probe_permutation_is_normalized() {
    let first = "before\n  pending objects to delete (2)\n  (of the export-id \"fixture-export\")\n   › fixture.file\n   › fixture.http\nafter\n";
    let second = first.replace(
        "   › fixture.file\n   › fixture.http\n",
        "   › fixture.http\n   › fixture.file\n",
    );
    assert_eq!(normalize(first, Some("fixture.file")), normalize(&second, Some("fixture.file")));
    assert_ne!(normalize(first, None), normalize(&second, None));
    for altered in [
        second.replace("(2)", "(1)"),
        second.replace("   › fixture.file\n", ""),
        second.replace("fixture.file", "fixture.http"),
        second.replace("after", "changed"),
    ] {
        assert_ne!(normalize(&altered, Some("fixture.file")), first);
    }
}
