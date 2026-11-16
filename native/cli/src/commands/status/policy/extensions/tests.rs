//! Unit tests for `teambit.component/remove` extension configuration validation via [`validate_removal_config`].
//!
//! Verifies valid `removed`, `range`, and `snaps` configurations and rejects unknown or malformed fields across [`validate_removal_config`].

use super::validate_removal_config;
use serde_json::json;

/// Verifies [`validate_removal_config`] accepts published `removed`, `range`, and `snaps` [`json`] configurations.
///
/// Covers boolean `removed`, semver `range`, 40-hex `snaps` arrays, and `removeOnMain`.
#[test]
fn removal_configuration_accepts_published_range_snaps_and_false() {
    for config in [
        json!({"removed":false}),
        json!({"range":"^0.0.1"}),
        json!({"snaps":["0123456789012345678901234567890123456789"]}),
        json!({"removed":true,"removeOnMain":false}),
    ] {
        assert!(validate_removal_config(config.as_object().unwrap()).is_ok());
    }
}
/// Verifies that [`validate_removal_config`] rejects unknown keys and non-conforming field types.
#[test]
fn removal_configuration_rejects_unknown_fields_and_corrupt_values() {
    for config in [
        json!({"removed":"false"}),
        json!({"range":"not a range"}),
        json!({"snaps":[false]}),
        json!({"unknown":true}),
    ] {
        assert!(validate_removal_config(config.as_object().unwrap()).is_err());
    }
}

/// Verifies that [`validate_removal_config`] accepts an empty removal configuration object (`{}`).
///
/// Ensures an empty `teambit.component/remove` config object is treated as a valid no-op removal config.
#[test]
fn empty_removal_config_object_is_valid() {
    assert!(validate_removal_config(json!({}).as_object().unwrap()).is_ok());
}
