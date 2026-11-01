//! Unit tests for `bit login` option parsing.

use super::{Options, parse_options};

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

#[test]
fn empty_login_args_parse_to_default_options() {
    assert_eq!(parse_options(&[]), Some(Options::default()));
}
