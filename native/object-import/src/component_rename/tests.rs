use super::{identity, refactor};

#[test]
fn class_and_filename_replacements_follow_the_published_order() {
    let result =
        refactor::content(b"my-button myButton MyButton", "my-button", "your-card").unwrap();
    assert_eq!(result, b"your-card yourCard YourCard");
    assert_eq!(
        refactor::filename("my-button/my-button.ts", "my-button", "your-card").unwrap(),
        "your-card/my-button.ts",
    );
}
#[test]
fn binary_sources_and_package_prefix_lookalikes_are_preserved() {
    assert_eq!(refactor::content(b"\0my-button", "my-button", "other").unwrap(), b"\0my-button");
    assert_eq!(
        refactor::package(b"'@org/old' '@org/old/sub' '@org/older'", "@org/old", "@org/new")
            .unwrap(),
        b"'@org/new' '@org/new/sub' '@org/older'",
    );
}
#[test]
fn invalid_new_names_are_rejected_before_sources_are_read() {
    assert!(identity::validate_name("valid/component").is_ok());
    assert!(
        identity::validate_name("scope.component")
            .unwrap_err()
            .to_string()
            .contains("--scope"),
    );
    assert!(identity::validate_name("Invalid").is_err());
    assert!(identity::validate_name("nested//component").is_err());
}
