//! Unit tests for `bit login` [`Options`] CLI parsing ([`parse_options`]).
//!
//! Verifies `--cloud-domain`, `--default-cloud-domain`, `--no-browser`, and default [`Options`] initialization.

use super::{Options, parse_options};

/// Verifies [`parse_options`] for `bit login` CLI flags covering `--default-cloud-domain`, `-d`, and `--no-browser`.
///
/// Also confirms that unexpected positional arguments return `None`.
#[test]
fn parses_login_options() {
    assert_eq!(
        parse_options(&["--default-cloud-domain", "-d", "custom.bit.cloud", "--no-browser"]),
        Some(Options {
            cloud_domain: Some("custom.bit.cloud".into()),
            default_cloud_domain: true,
            port: None,
            no_browser: true,
            machine_name: None,
            skip_config_update: false,
            refresh_token: false,
            json: false,
        }),
    );
    assert_eq!(parse_options(&["unexpected-positional"]), None);
}

/// Verifies that an empty argument slice parses to [`Options::default`].
///
/// Ensures `bit login` without flags retains default domain and browser behavior.
#[test]
fn empty_login_args_parse_to_default_options() {
    assert_eq!(parse_options(&[]), Some(Options::default()));
}
