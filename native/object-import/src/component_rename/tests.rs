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

#[test]
fn same_name_replacements_qualify_new_components_by_their_default_scope() {
    let mut rows=serde_json::json!({"comp1":{"name":"comp1","scope":"old.scope","version":"0.0.1","defaultScope":"old.scope"}}).as_object().unwrap().clone();
    let key =
        super::configuration::target_key(&mut rows, "comp1", "replacement.scope/comp1").unwrap();
    assert_eq!(key, "replacement.scope/comp1");
    assert!(rows.contains_key("old.scope/comp1"));
    assert!(!rows.contains_key("comp1"));
}

#[test]
fn reusable_package_matchers_preserve_regex_capture_and_literal_replacement_semantics() {
    let pairs = vec![("@org/a.b".into(), "@new/$&".into())];
    let mut matchers = refactor::PackageMatchers::new(&pairs);
    for _ in 0..2 {
        assert_eq!(
            matchers.apply(b"'@org/axb' '@org/a.b/sub' '@org/a.b-extra'").unwrap(),
            b"'@new/$&' '@new/$&/sub' '@org/a.b-extra'",
        );
    }
    let mut captures = refactor::PackageMatchers::new(&[("@org/(old)".into(), "@new/pkg".into())]);
    assert_eq!(captures.apply(b"'@org/old'").unwrap(), b"'@new/pkgold");
}
#[test]
fn ordered_package_matchers_compile_only_after_binary_files_and_fail_in_pair_order() {
    let mut matchers = refactor::PackageMatchers::new(&[
        ("[".into(), "unused".into()),
        ("(".into(), "unused".into()),
    ]);
    assert_eq!(matchers.apply(b"binary\0data").unwrap(), b"binary\0data");
    let expected = refactor::package(b"text", "[", "unused").unwrap_err();
    let actual = matchers.apply(b"text").unwrap_err();
    assert_eq!(actual.kind(), expected.kind());
    assert_eq!(actual.to_string(), expected.to_string());
    let mut chain = refactor::PackageMatchers::new(&[
        ("@old/pkg".into(), "@mid/pkg".into()),
        ("@mid/pkg".into(), "@new/pkg".into()),
    ]);
    assert_eq!(chain.apply(b"'@old/pkg'").unwrap(), b"'@new/pkg'");
}

#[test]
fn reusable_empty_package_matcher_preserves_lossy_text_and_binary_behavior() {
    let mut matcher = refactor::PackageMatcher::new("", "");
    assert_eq!(matcher.apply(b"bad\xff'quoted/sub").unwrap(), "bad\u{fffd}'quoted/sub".as_bytes());
    assert_eq!(matcher.apply(b"binary\0\xff'quoted").unwrap(), b"binary\0\xff'quoted");
    assert_eq!(matcher.apply(b"second/path").unwrap(), b"second/path");
}

#[test]
fn ordered_package_matchers_preserve_unmatched_and_lossy_sources() {
    let mut no_match = refactor::PackageMatchers::new(&[
        ("@missing/one".into(), "@new/one".into()),
        ("@missing/two".into(), "@new/two".into()),
    ]);
    assert_eq!(no_match.apply(b"plain source").unwrap(), b"plain source");
    assert_eq!(no_match.apply(b"bad\xff source").unwrap(), "bad\u{fffd} source".as_bytes());
    let mut chain = refactor::PackageMatchers::new(&[
        ("@missing/pkg".into(), "unused".into()),
        ("@old/p.g".into(), "@mid/pkg".into()),
        ("@mid/pkg".into(), "@final/pkg".into()),
    ]);
    assert_eq!(chain.apply(b"'@old/pkg'").unwrap(), b"'@final/pkg'");
}

#[test]
fn same_name_content_retains_lossy_conversion_and_regex_metacharacters() {
    assert_eq!(
        refactor::content(b"bad\xff comp-one", "comp-one", "comp-one").unwrap(),
        "bad\u{fffd} comp-one".as_bytes(),
    );
    assert_eq!(
        refactor::content(b"binary\0\xffcomp-one", "comp-one", "comp-one").unwrap(),
        b"binary\0\xffcomp-one",
    );
    assert_eq!(refactor::content(b"axb a.b", "a.b", "a.b").unwrap(), b"a.b a.b");
}
