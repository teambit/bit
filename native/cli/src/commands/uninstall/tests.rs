use super::parse_arguments;
use std::ffi::OsString;

#[test]
fn extracts_positional_package_names() {
    let args = [
        OsString::from("uninstall"),
        OsString::from("is-positive"),
        OsString::from("--no-color"),
        OsString::from("is-negative"),
    ];
    let packages = parse_arguments(&args).unwrap();
    assert_eq!(packages, vec!["is-positive", "is-negative"]);
}

#[test]
fn ignores_empty_package_string() {
    let args = [OsString::from("uninstall"), OsString::from("")];
    let packages = parse_arguments(&args);
    assert!(packages.is_none());
}
