use super::{coerce, gt, satisfies, satisfies_including_prerelease, valid_range};
use serde_json::Value;

/// Outputs of npm's `semver` 7.7.1 and `semver-range-intersect` 0.3.1, generated
/// with Node.js from the packages Bit ships.
pub(in crate::manifests) fn golden() -> Value {
    serde_json::from_str(include_str!("golden.json")).expect("golden fixture")
}

fn text(value: &Value) -> Option<String> {
    value.as_str().map(str::to_string)
}

#[test]
fn valid_range_matches_semver_7() {
    for case in golden()["validRange"].as_array().unwrap() {
        let range = case[0].as_str().unwrap();
        assert_eq!(valid_range(range), text(&case[1]), "validRange({range:?})");
    }
}

#[test]
fn satisfies_matches_semver_7() {
    for case in golden()["satisfies"].as_array().unwrap() {
        let (version, range) = (case[0].as_str().unwrap(), case[1].as_str().unwrap());
        assert_eq!(
            satisfies(version, range),
            case[2].as_bool().unwrap(),
            "satisfies({version}, {range})",
        );
    }
}

#[test]
fn include_prerelease_admits_prereleases_of_other_tuples() {
    assert!(!satisfies("2.1.0-beta.1", "^2.0.0"));
    assert!(satisfies_including_prerelease("2.1.0-beta.1", "^2.0.0"));
    assert!(!satisfies_including_prerelease("3.0.0-beta.1", "^2.0.0"));
    assert!(satisfies_including_prerelease("2.0.0", "^2.0.0"));
    assert!(!satisfies_including_prerelease("not a version", "^2.0.0"));
}

#[test]
fn coerce_matches_semver_7() {
    for case in golden()["coerce"].as_array().unwrap() {
        let version = case[0].as_str().unwrap();
        assert_eq!(coerce(version), text(&case[1]), "coerce({version:?})");
    }
}

#[test]
fn gt_compares_prereleases_before_releases() {
    assert!(gt("1.0.0", "1.0.0-rc.1").unwrap());
    assert!(gt("1.0.0-rc.10", "1.0.0-rc.9").unwrap());
    assert!(gt("1.0.0-beta", "1.0.0-1").unwrap());
    assert!(!gt("1.0.0", "1.0.0").unwrap());
    assert!(gt("abc", "1.0.0").is_err());
}
