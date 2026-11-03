//! Unit tests for progress reporter throttle interval parsing ([`throttle`]) in `bit-install`.
//! Covers explicit numeric milliseconds, `null` reset, and non-numeric rejection ([`explicit_install_option_overrides_the_default_and_null_restores_it`]).

use super::throttle;
use serde_json::json;
use std::time::Duration;
/// Verifies that an explicit numeric `throttleProgress` option overrides the default and `null` restores 200ms via [`throttle`] ([`Duration`]).
#[test]
fn explicit_install_option_overrides_the_default_and_null_restores_it() {
    assert_eq!(throttle(None).unwrap(), None);
    assert_eq!(throttle(Some(&json!(60000))).unwrap(), Some(Duration::from_mins(1)));
    assert_eq!(throttle(Some(&json!(null))).unwrap(), Some(Duration::from_millis(200)));
    assert_eq!(throttle(Some(&json!(0))).unwrap(), Some(Duration::ZERO));
}
/// Verifies that [`throttle`] wraps floating-point numbers like N-API `u32` and rejects non-numeric JSON values ([`Duration`]).
#[test]
fn numeric_values_follow_napi_unsigned32_conversion_and_non_numbers_are_rejected() {
    assert_eq!(throttle(Some(&json!(4294967297.9))).unwrap(), Some(Duration::from_millis(1)));
    assert_eq!(
        throttle(Some(&json!(-1.9))).unwrap(),
        Some(Duration::from_millis(u64::from(u32::MAX))),
    );
    assert_eq!(throttle(Some(&json!(-0.0))).unwrap(), Some(Duration::ZERO));
    for value in [json!("60000"), json!(false), json!({}), json!([])] {
        assert!(throttle(Some(&value)).is_err());
    }
}
