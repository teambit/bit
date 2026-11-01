//! Unit tests for `bit server` port and compile option parsing.

use super::{Options, parse_options};

#[test]
fn parses_and_validates_server_port() {
    assert_eq!(parse_options(&[]), Some(Options { port: None, compile: false }));
    assert_eq!(
        parse_options(&["-p", "3000", "--compile"]),
        Some(Options { port: Some(3000), compile: true }),
    );
    assert_eq!(parse_options(&["--port=invalid"]), None);
}

#[test]
fn parses_inline_port_and_compile_false_flag() {
    assert_eq!(
        parse_options(&["--port=4000", "--compile=false"]),
        Some(Options { port: Some(4000), compile: false }),
    );
}
