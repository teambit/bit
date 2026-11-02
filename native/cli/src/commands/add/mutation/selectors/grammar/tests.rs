//! Unit tests for selector state grammar [`validate`], [`ordinary`], and [`union`] ordering.
//!
//! Verifies [`applied`] `$env` parameter normalization and [`identities`] deduplication order.

use super::{applied, identities, ordinary, union, validate};
use serde_json::json;

/// Verifies that ordinary pattern matches precede state selector results and [`union`] preserves first occurrence.
#[test]
fn ordinary_matches_precede_state_results_and_union_keeps_first_occurrence() {
    let pool = vec![json!({"identity":"scope/a"}), json!({"identity":"scope/b"})];
    let parts = crate::commands::patterns::split("$new,**/b");
    let mut selected = ordinary(&pool, &parts).unwrap();
    union(&mut selected, pool.clone());
    union(&mut selected, pool);
    assert_eq!(identities(&selected), ["scope/b", "scope/a"]);
}

/// Verifies that `$env` uses only its first parameter and unrecognized state selectors fail with canonical errors.
#[test]
fn env_uses_only_the_first_parameter_and_invalid_state_errors_are_canonical() {
    assert_eq!(applied("$env:scope/env:ignored"), "$env:scope/env");
    assert_eq!(
        validate("$invalid").unwrap_err().to_string(),
        "state invalid is not recognized, possible values: new, modified, deprecated, deleted, internal, snappedOnMain, softTagged, codeModified, localOnly",
    );
    assert_eq!(
        validate("$other:value").unwrap_err().to_string(),
        "byMultiParamState expect the state to be one of the following: ['env'], got other",
    );
}

#[test]
fn valid_single_and_env_state_selectors_pass_validation() {
    for selector in ["$new", "$modified", "$deprecated", "$env:scope/env"] {
        assert!(validate(selector).is_ok(), "{selector}");
    }
}
