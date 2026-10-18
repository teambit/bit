use super::validate_removal_config;
use serde_json::json;

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
