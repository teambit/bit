use super::{extract_package_name, is_valid_package_name, version_with_save_prefix};

#[test]
fn extracts_package_names() {
    assert_eq!(extract_package_name("lodash@4.17.21"), "lodash");
    assert_eq!(extract_package_name("@types/node@20"), "@types/node");
    assert_eq!(extract_package_name("@types/node"), "@types/node");
    assert_eq!(extract_package_name("@scope/a@b/c"), "@scope/a@b/c");
    assert_eq!(extract_package_name("git+https://x.com/a@b"), "git+https://x.com/a@b");
    assert_eq!(extract_package_name("lodash"), "lodash");
}

#[test]
fn validates_like_valid_for_old_packages() {
    assert!(is_valid_package_name("lodash"));
    assert!(is_valid_package_name("@types/node"));
    assert!(is_valid_package_name("string_decoder"));
    assert!(is_valid_package_name("UpperCase"));
    assert!(!is_valid_package_name("my-scope/comp"));
    assert!(!is_valid_package_name(".hidden"));
    assert!(!is_valid_package_name("_private"));
    assert!(!is_valid_package_name("node_modules"));
    assert!(!is_valid_package_name(" spaced"));
}

#[test]
fn save_prefix_rules() {
    assert_eq!(version_with_save_prefix("1.2.3", None, None).unwrap(), "^1.2.3");
    assert_eq!(version_with_save_prefix("1.2.3", Some("~"), None).unwrap(), "~1.2.3");
    assert_eq!(version_with_save_prefix("1.2.3", None, Some("1.2.3")).unwrap(), "1.2.3");
    assert_eq!(version_with_save_prefix("1.2.3", None, Some("~1.2.0")).unwrap(), "~1.2.0");
    assert_eq!(version_with_save_prefix("1.2.3-beta.1", Some("^"), None).unwrap(), "1.2.3-beta.1");
    assert_eq!(version_with_save_prefix("1.2.3", None, Some(">=1")).unwrap(), "^1.2.3");
    assert!(version_with_save_prefix("1.2.3", Some("!"), None).is_err());
}
