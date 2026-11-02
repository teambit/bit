//! Unit tests for `bit watch` [`Options`] CLI parsing ([`parse_options`]) and `--check-types` value validation ([`check_types_error`]).
//!
//! Verifies `--verbose`, `--skip-pre-compilation`, `--import`, `--generate-types`, and `--trigger` flags.

use super::{Options, check_types_error, parse_options};

/// Verifies `bit watch` [`Options`] parsing via [`parse_options`] and validation via [`check_types_error`].
///
/// Checks `"file"` and `"project"` `--check-types` modes alongside invalid mode error messages.
#[test]
fn parses_watch_options_and_validates_check_types() {
    let opts = parse_options(&[
        "-v",
        "--skip-pre-compilation",
        "-t",
        "project",
        "--import",
        "--generate-types",
        "--trigger",
        "comp1",
    ])
    .unwrap();
    assert_eq!(
        opts,
        Options {
            verbose: true,
            skip_pre_compilation: true,
            check_types: Some("project".into()),
            import: true,
            skip_import: false,
            generate_types: true,
            trigger: Some("comp1".into()),
        },
    );
    assert_eq!(check_types_error(&opts), None);

    let invalid = parse_options(&["--check-types", "invalid"]).unwrap();
    assert_eq!(
        check_types_error(&invalid),
        Some(r#"check-types can be either "file" or "project". got "invalid""#.into()),
    );
    assert_eq!(parse_options(&["--trigger=-bad"]), None);
    assert!(parse_options(&["--verbose=true", "--import=false"]).unwrap().verbose);
    assert_eq!(check_types_error(&parse_options(&["--check-types", "file"]).unwrap()), None);
}

/// Verifies that [`parse_options`] parses empty `bit watch` arguments to [`Options::default`].
///
/// Ensures `bit watch` with no flags defaults `verbose`, `skip_pre_compilation`, and `generate_types` to `false`.
#[test]
fn empty_watch_args_parse_to_default_options() {
    assert_eq!(parse_options(&[]), Some(Options::default()));
}
