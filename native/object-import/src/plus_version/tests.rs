use super::{is_plus, resolve};

#[test]
fn release_ranges_snap_versions_and_unresolved_placeholders() {
    for placeholder in ["+", "+^", "+~"] {
        assert!(is_plus(placeholder));
        assert_eq!(resolve(placeholder, None, "*"), "*");
        assert_eq!(resolve(placeholder, Some(""), "+"), "+");
        for snap_or_range in ["abcdef0123456789", "0.0.0-abcdef0123456789", "^2.0.0", "*"] {
            assert_eq!(resolve(placeholder, Some(snap_or_range), "*"), snap_or_range);
        }
    }
    for (placeholder, expected) in [("+", "2.0.21"), ("+^", "^2.0.21"), ("+~", "~2.0.21")] {
        assert_eq!(resolve(placeholder, Some("2.0.21"), "*"), expected);
    }
    assert_eq!(resolve("+^", Some("2.0.21-beta.1"), "*"), "^2.0.21-beta.1");
    for version in ["", "+>", "-", "1.0.0", "^1.0.0"] {
        assert!(!is_plus(version));
        assert_eq!(resolve(version, Some("2.0.21"), "*"), version);
    }
}
