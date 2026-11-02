//! Unit tests for `switch --pattern` [`Entry`] multimatch [`filter`]ing and error messages.
//!
//! Confirms multimatch inclusion/exclusion ordering, version suffix stripping, and no-match errors in `bit-object-import`.

use super::{Entry, filter};

/// Builds a visible lane [`Entry`] fixture for `identity` with a synthetic 40-hex head.
fn entry(identity: &str) -> Entry {
    Entry { identity: identity.into(), head: "a".repeat(40), hidden: false }
}
#[test]
fn switch_patterns_preserve_multimatch_order_exclusion_reinclusion_and_ignore_versions() {
    let entries = [entry("scope/alpha"), entry("scope/beta"), entry("scope/nested/alpha")];
    assert_eq!(
        filter("scope/beta,scope/**,!scope/alpha,scope/alpha@0.0.1", &entries).unwrap(),
        ["scope/beta", "scope/nested/alpha", "scope/alpha"],
    );
    assert_eq!(filter("!scope/alpha", &entries).unwrap(), ["scope/beta", "scope/nested/alpha"]);
}
#[test]
fn switch_patterns_use_full_id_and_no_match_is_the_published_error() {
    let error = filter("alpha", &[entry("scope/alpha")]).err().unwrap();
    assert_eq!(error.to_string(), r#"unable to find any component matching the "alpha" pattern"#);
    assert!(filter("$modified", &[entry("scope/alpha")]).is_err());
}

#[test]
fn ordered_sorts_entries_by_selected_identity_position() {
    let entries = vec![entry("scope/alpha"), entry("scope/beta")];
    let selected = ["scope/beta".to_owned(), "scope/alpha".to_owned()];
    let sorted = super::ordered(entries, Some(&selected));
    assert_eq!(sorted[0].identity, "scope/beta");
    assert_eq!(sorted[1].identity, "scope/alpha");
}
